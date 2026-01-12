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
