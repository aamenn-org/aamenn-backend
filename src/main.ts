import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['error', 'warn', 'log'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Security middleware with strict CSP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for some UI frameworks
          imgSrc: ["'self'", 'data:', 'https:'], // Allow images from HTTPS and data URIs
          connectSrc: ["'self'"], // API calls to same origin only
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"], // Prevent clickjacking
          upgradeInsecureRequests: nodeEnv === 'production' ? [] : null, // Force HTTPS in production
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },
      noSniff: true, // Prevent MIME type sniffing
      xssFilter: true, // Enable XSS filter
      hidePoweredBy: true, // Hide X-Powered-By header
    }),
  );

  // CORS configuration  // CORS - Strict configuration with no wildcards
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  
  if (nodeEnv === 'production' && !corsOrigin) {
    throw new Error(
      'SECURITY ERROR: CORS_ORIGIN environment variable is required in production. ' +
      'Provide a comma-separated list of allowed origins (e.g., https://app.example.com,https://www.example.com)'
    );
  }
  
  const allowedOrigins = corsOrigin 
    ? corsOrigin.split(',').map(origin => origin.trim())
    : ['http://localhost:3000', 'http://localhost:5173']; // Dev-only defaults
  
  // Validate no wildcards in production
  if (nodeEnv === 'production' && allowedOrigins.some(origin => origin.includes('*'))) {
    throw new Error(
      'SECURITY ERROR: Wildcard origins are not allowed in production. ' +
      'Specify exact allowed origins in CORS_ORIGIN.'
    );
  }
  
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count'],
    maxAge: 86400, // 24 hours
  });

  // Global exception filter (never logs sensitive data)
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global logging interceptor (logs method, path, timing - never logs bodies or auth headers)
  // Enable in all environments for observability
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Global response transform interceptor (wraps all responses in unified format)
  app.useGlobalInterceptors(new TransformInterceptor());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger/OpenAPI Documentation
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Aamenn Vault API')
      .setDescription(
        `True Zero-Knowledge Encrypted Photo Vault API.
        
## Authentication
- All protected endpoints require a valid JWT Bearer token
- Obtain tokens via \`/auth/login\`
- Include token in Authorization header: \`Bearer <token>\`

## TRUE End-to-End Encryption Architecture
- Backend NEVER sees plaintext data at any stage
- All encryption/decryption happens client-side
- Thumbnails generated client-side before encryption
- Backend receives ONLY encrypted blobs (opaque bytes)
- Backend stores only encrypted data and metadata
- Server cannot decrypt user files under any circumstances

## Security Guarantees
- ✅ Client-side thumbnail generation
- ✅ Client-side encryption (AES-GCM recommended)
- ✅ Server stores only encrypted blobs
- ✅ Zero-knowledge key management
- ✅ Refresh token rotation & revocation
- ✅ Rate limiting on auth endpoints`,
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Authentication', 'User authentication endpoints')
      .addTag('Users', 'User profile and security management')
      .addTag('Files', 'Encrypted file management')
      .addTag('Albums', 'Album organization')
      .addTag('Health', 'Health check endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    logger.log(`📚 Swagger documentation available at /docs`);
  }

  await app.listen(port);
  logger.log(`🚀 Application running on port ${port} in ${nodeEnv} mode`);
  logger.log(`📋 Zero-Knowledge Mode: Backend never sees plaintext data`);
}

bootstrap();
