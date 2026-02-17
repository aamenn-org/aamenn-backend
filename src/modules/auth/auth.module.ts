import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { RefreshToken } from '../../database/entities/refresh-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
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
        
        const issuer = configService.get<string>('JWT_ISSUER') || 'aamenn';
        const audience =
          configService.get<string>('JWT_AUDIENCE') || 'aamenn-app';

        return {
          secret: jwtSecret,
          signOptions: {
            issuer,
            audience,
          },
        };
      },
      inject: [ConfigService],
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, JwtAuthGuard, AuthService],
  exports: [JwtAuthGuard, PassportModule, AuthService, JwtModule],
})
export class AuthModule {}
