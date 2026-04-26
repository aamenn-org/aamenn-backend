import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * NestJS guard that verifies Cloudflare Turnstile CAPTCHA tokens.
 *
 * Reads `turnstileToken` from `req.body` and validates it against the
 * Cloudflare siteverify endpoint. Fails open if Cloudflare is unreachable
 * (logs warning, allows request through).
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);
  private readonly secretKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('TURNSTILE_SECRET_KEY');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // If no secret key configured, skip verification (development mode)
    if (!this.secretKey) {
      this.logger.warn('TURNSTILE_SECRET_KEY not configured — skipping CAPTCHA verification');
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token: string | undefined = request.body?.turnstileToken;

    if (!token) {
      throw new BadRequestException('CAPTCHA verification failed');
    }

    const remoteip =
      request.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.ip ||
      undefined;

    try {
      const response = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: this.secretKey,
            response: token,
            remoteip,
          }),
          signal: AbortSignal.timeout(5000),
        },
      );

      const data: TurnstileVerifyResponse = await response.json();

      if (!data.success) {
        this.logger.warn(
          `Turnstile verification failed: ${(data['error-codes'] || []).join(', ')}`,
        );
        throw new BadRequestException('CAPTCHA verification failed');
      }

      return true;
    } catch (error) {
      // If it's our own BadRequestException, rethrow
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Fail open — Cloudflare unreachable
      this.logger.warn(
        `Turnstile verification request failed (allowing through): ${error.message}`,
      );
      return true;
    }
  }
}
