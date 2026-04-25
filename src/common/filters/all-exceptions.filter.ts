import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { UnifiedErrorResponseDto } from '../dto/unified-response.dto';

/**
 * Error type categorization for better client-side handling
 */
const ERROR_TYPES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'AUTHENTICATION_ERROR',
  403: 'AUTHORIZATION_ERROR',
  404: 'NOT_FOUND_ERROR',
  409: 'CONFLICT_ERROR',
  422: 'UNPROCESSABLE_ERROR',
  429: 'RATE_LIMIT_ERROR',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY_ERROR',
  503: 'SERVICE_UNAVAILABLE_ERROR',
};

const HTTP_STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * Global Exception Filter
 * 
 * Catches all exceptions and transforms them into unified error responses:
 * { success: false, error: { code, message, details?, type? }, meta? }
 * 
 * Handles:
 * - HTTP exceptions (validation, auth, not found, etc.)
 * - Validation pipe errors (field-level details)
 * - Unexpected errors (logged but sanitized for client)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let details: Record<string, any> | undefined;
    let errorType: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const responseObj = exceptionResponse as Record<string, any>;
        
        // Handle validation errors (array of messages from class-validator)
        if (Array.isArray(responseObj.message)) {
          // Join all validation messages into a human-readable string
          message = responseObj.message.join('. ');
          // Also provide field-specific details for structured handling
          details = this.parseValidationErrors(responseObj.message);
          errorType = 'VALIDATION_ERROR';
        } else {
          message = responseObj.message || 'An error occurred';
          // Include any additional error details
          if (responseObj.error) {
            details = { error: responseObj.error };
          }
        }
      } else {
        message = 'An error occurred';
      }

      // Set error type based on status code if not already set
      if (!errorType) {
        errorType = ERROR_TYPES[status];
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      errorType = 'INTERNAL_ERROR';

      // Log unexpected errors (but never log sensitive data)
      this.logger.error(
        `Unexpected error on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const errorResponse: UnifiedErrorResponseDto = {
      success: false,
      error: {
        code: status,
        message,
        ...(details && { details }),
        ...(errorType && { type: errorType }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };

    response.status(status).json(errorResponse);
  }

  /**
   * Parse validation error messages into field-specific details
   * Converts ["email must be an email", "password is too short"] 
   * to { email: "must be an email", password: "is too short" }
   * 
   * If multiple errors for the same field, they are joined with ". "
   */
  private parseValidationErrors(messages: string[]): Record<string, string> {
    const details: Record<string, string> = {};
    
    for (const msg of messages) {
      // Try to extract field name from message (e.g., "email must be valid")
      const match = msg.match(/^(\w+)\s+(.+)$/);
      if (match) {
        const [, field, error] = match;
        // If field already has errors, append with separator
        if (details[field]) {
          details[field] = `${details[field]}. ${error}`;
        } else {
          details[field] = error;
        }
      } else {
        // If can't parse, use generic key
        if (details.validation) {
          details.validation = `${details.validation}. ${msg}`;
        } else {
          details.validation = msg;
        }
      }
    }
    
    return details;
  }
}
