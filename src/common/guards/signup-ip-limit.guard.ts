import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Guard that limits the number of successful signups per IP address.
 * Default: max 3 accounts per IP per 24 hours.
 *
 * This guard only CHECKS the count. The count is INCREMENTED by
 * AuthService.register() after a successful registration.
 */
@Injectable()
export class SignupIpLimitGuard implements CanActivate {
  private readonly logger = new Logger(SignupIpLimitGuard.name);
  private redis: Redis;
  private readonly maxSignupsPerIp: number;

  constructor(private configService: ConfigService) {
    this.maxSignupsPerIp = this.configService.get<number>('SIGNUP_MAX_PER_IP', 3);

    const redisHost = this.configService.get<string>('redis.host', 'localhost');
    const redisPort = this.configService.get<number>('redis.port', 6379);
    const redisPassword = this.configService.get<string>('redis.password');

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      maxRetriesPerRequest: 3,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = this.extractIp(request);
    const key = `signup:ip-count:${ip}`;

    try {
      const count = parseInt((await this.redis.get(key)) || '0', 10);

      if (count >= this.maxSignupsPerIp) {
        this.logger.warn(`Signup IP limit reached for ${ip} (${count}/${this.maxSignupsPerIp})`);
        throw new HttpException(
          'Too many accounts created from this network. Please try again in 24 hours.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // If Redis is down, allow the request (fail open for availability)
      this.logger.error('SignupIpLimitGuard Redis error:', error.message);
    }

    return true;
  }

  /**
   * Increment the signup count for an IP after a successful registration.
   * Called by AuthService, not by the guard itself.
   */
  async incrementSignupCount(ip: string): Promise<void> {
    const key = `signup:ip-count:${ip}`;
    const TTL_24H = 86400;

    try {
      const exists = await this.redis.exists(key);
      await this.redis.incr(key);
      if (!exists) {
        await this.redis.expire(key, TTL_24H);
      }
    } catch (error) {
      this.logger.error('Failed to increment signup count:', error.message);
    }
  }

  private extractIp(request: any): string {
    // X-Forwarded-For can be comma-separated; first entry is the real client IP
    const forwarded = request.headers?.['x-forwarded-for'];
    if (forwarded) {
      const first = typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0];
      return first?.trim() || 'unknown';
    }
    return request.ip || request.connection?.remoteAddress || 'unknown';
  }
}
