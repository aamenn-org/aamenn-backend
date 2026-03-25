import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
}));

export const databaseConfig = registerAs('database', () => ({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD,
  name: process.env.DATABASE_NAME || 'aamenn_vault',
}));

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  issuer: process.env.JWT_ISSUER || 'aamenn',
  audience: process.env.JWT_AUDIENCE,
  accessTokenExpiration: process.env.JWT_ACCESS_EXPIRATION || '90m',
  refreshTokenExpiration: process.env.JWT_REFRESH_EXPIRATION || '30d',
}));

export const b2Config = registerAs('b2', () => ({
  applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketId: process.env.B2_BUCKET_ID,
  bucketName: process.env.B2_BUCKET_NAME,
  signedUrlExpiration: parseInt(
    process.env.B2_SIGNED_URL_EXPIRATION || '300',
    10,
  ),
}));

export const throttleConfig = registerAs('throttle', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
  limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
}));

export const storageConfig = registerAs('storage', () => ({
  limitGb: parseFloat(process.env.STORAGE_LIMIT_GB || '1'),
}));

export const googleConfig = registerAs('google', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  // For @react-oauth/google with auth-code flow, use 'postmessage' as redirect URI
  redirectUri: process.env.GOOGLE_REDIRECT_URI || 'postmessage',
}));

export const mailConfig = registerAs('mail', () => ({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.EMAIL_FROM || 'noreply@aamenn.com',
  otpTtlSeconds: parseInt(process.env.VAULT_RESET_OTP_TTL_SECONDS || '600', 10),
  resetSessionTtlSeconds: parseInt(process.env.VAULT_RESET_SESSION_TTL_SECONDS || '900', 10),
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  ttl: {
    albums: parseInt(process.env.CACHE_TTL_ALBUMS || '60', 10),
    files: parseInt(process.env.CACHE_TTL_FILES || '30', 10),
    storage: parseInt(process.env.CACHE_TTL_STORAGE || '60', 10),
    duplicate: parseInt(process.env.CACHE_TTL_DUPLICATE || '900', 10),
  },
}));
