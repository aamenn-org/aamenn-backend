import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

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

  // Security middleware
  app.use(helmet());

  // CORS configuration
  app.enableCors({
    origin:
      nodeEnv === 'production'
        ? configService.get<string>('CORS_ORIGIN')
        : true,
    credentials: true,
  });

  // Global exception filter (never logs sensitive data)
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global logging interceptor (only logs method, path, timing)
  if (nodeEnv !== 'production') {
    app.useGlobalInterceptors(new LoggingInterceptor());
  }

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
        `Zero-knowledge encrypted photo vault API.
        
## Authentication
- All protected endpoints require a valid JWT Bearer token
- Obtain tokens via \`/auth/login\` or \`/auth/google\`
- Include token in Authorization header: \`Bearer <token>\`

## Zero-Knowledge Architecture
- Backend never sees plaintext data
- All encryption/decryption happens client-side
- Backend stores only encrypted metadata`,
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
