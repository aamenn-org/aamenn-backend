import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FilesModule } from './modules/files/files.module';
import { AlbumsModule } from './modules/albums/albums.module';
import { StorageModule } from './modules/storage/storage.module';
import { AdminModule } from './modules/admin/admin.module';
import { CacheModule } from './modules/cache/cache.module';
import { MailModule } from './modules/mail/mail.module';

import { User } from './database/entities/user.entity';
import { UserSecurity } from './database/entities/user-security.entity';
import { File } from './database/entities/file.entity';
import { Album } from './database/entities/album.entity';
import { AlbumFile } from './database/entities/album-file.entity';
import { DownloadLog } from './database/entities/download-log.entity';
import { RefreshToken } from './database/entities/refresh-token.entity';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import {
  appConfig,
  databaseConfig,
  jwtConfig,
  b2Config,
  throttleConfig,
  storageConfig,
  googleConfig,
  mailConfig,
  redisConfig,
} from './config/configuration';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        b2Config,
        throttleConfig,
        storageConfig,
        googleConfig,
        mailConfig,
        redisConfig,
      ],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        // CRITICAL: Disable synchronize in ALL environments to prevent data loss
        // TypeORM synchronize can DROP COLUMNS and TABLES on schema changes
        // Always use migrations for schema changes
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');
        
        // Explicit guard: synchronize is NEVER allowed
        const synchronize = false;
        
        // Log warning if someone tries to enable it via env var
        if (configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true') {
          throw new Error(
            'CRITICAL ERROR: TypeORM synchronize is explicitly disabled for safety. ' +
            'Use migrations instead. Remove TYPEORM_SYNCHRONIZE from environment variables.'
          );
        }
        
        return {
          type: 'postgres',
          host: configService.get<string>('DATABASE_HOST', 'localhost'),
          port: configService.get<number>('DATABASE_PORT', 5432),
          username: configService.get<string>('DATABASE_USERNAME', 'postgres'),
          password: configService.get<string>('DATABASE_PASSWORD'),
          database: configService.get<string>('DATABASE_NAME', 'aamenn_vault'),
          entities: [User, UserSecurity, File, Album, AlbumFile, DownloadLog, RefreshToken],
          synchronize, // Always false
          logging: nodeEnv === 'development' ? ['error', 'warn'] : false,
          ssl:
            configService.get<string>('DATABASE_SSL') === 'true'
              ? { rejectUnauthorized: false }
              : false,
          // Connection pooling for production
          extra: {
            max: configService.get<number>('DATABASE_POOL_MAX', 20),
            min: configService.get<number>('DATABASE_POOL_MIN', 5),
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
          },
        };
      },
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('THROTTLE_TTL', 60000),
            limit: configService.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    CacheModule,
    MailModule,
    AuthModule,
    UsersModule,
    FilesModule,
    AlbumsModule,
    StorageModule,
    AdminModule,
  ],
  providers: [
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global JWT authentication guard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
