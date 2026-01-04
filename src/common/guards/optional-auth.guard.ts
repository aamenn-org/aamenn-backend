import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional Authentication Guard
 * Similar to JwtAuthGuard but doesn't throw if no token is provided.
 * Useful for routes that work both with and without authentication.
 */
@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: any, user: TUser): TUser | null {
    // Return null instead of throwing if authentication fails
    if (err || !user) {
      return null as any;
    }
    return user;
  }
}
