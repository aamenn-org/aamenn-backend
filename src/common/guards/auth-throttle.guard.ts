import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

@Injectable()
export class AuthThrottleGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Track by IP + email (if provided) for more granular rate limiting
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const email = req.body?.email || '';
    
    return `${ip}:${email}`;
  }
}
