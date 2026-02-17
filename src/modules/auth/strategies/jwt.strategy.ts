import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import {
  JwtPayload,
  AuthenticatedUser,
} from '../interfaces/jwt-payload.interface';
import { UserRole } from '../../../database/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    
    // CRITICAL: Enforce JWT_SECRET presence and minimum entropy
    if (!jwtSecret) {
      throw new Error(
        'SECURITY ERROR: JWT_SECRET environment variable is required. ' +
        'Application cannot start without a valid JWT secret.'
      );
    }
    
    if (jwtSecret.length < 32) {
      throw new Error(
        `SECURITY ERROR: JWT_SECRET must be at least 32 characters for adequate entropy. ` +
        `Current length: ${jwtSecret.length}. Please use a cryptographically secure random string.`
      );
    }
    
    const jwtIssuer = configService.get<string>('JWT_ISSUER') || 'aamenn';
    const jwtAudience =
      configService.get<string>('JWT_AUDIENCE') || 'aamenn-app';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      issuer: jwtIssuer,
      audience: jwtAudience,
    });
  }

  /**
   * Validate JWT payload and return authenticated user
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token: missing subject');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role || UserRole.USER,
    };
  }
}
