import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Unified API Response Schema
 * 
 * All API endpoints return this consistent structure:
 * - Success: { success: true, data: T, message?, meta? }
 * - Error: { success: false, error: { code, message, details? }, meta? }
 * 
 * This ensures predictable response handling across the entire application.
 */

/**
 * Pagination metadata for list responses
 */
export class PaginationMetaDto {
  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Items per page', example: 50 })
  limit: number;

  @ApiProperty({ description: 'Total number of items', example: 150 })
  total: number;

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages: number;
}

/**
 * Generic metadata that can be attached to any response
 */
export interface ResponseMeta {
  pagination?: PaginationMetaDto;
  timestamp?: string;
  requestId?: string;
  [key: string]: any;
}

/**
 * Error details for failed requests
 */
export class ErrorDetailsDto {
  @ApiProperty({ 
    description: 'HTTP status code', 
    example: 400 
  })
  code: number;

  @ApiProperty({ 
    description: 'Error message', 
    example: 'Validation failed' 
  })
  message: string;

  @ApiPropertyOptional({ 
    description: 'Additional error details (validation errors, field-specific messages)',
    example: { email: 'Invalid email format', password: 'Password too short' }
  })
  details?: Record<string, any>;

  @ApiPropertyOptional({ 
    description: 'Error type/category', 
    example: 'VALIDATION_ERROR' 
  })
  type?: string;
}

/**
 * Unified Success Response
 */
export class UnifiedSuccessResponseDto<T = any> {
  @ApiProperty({ 
    description: 'Indicates successful operation', 
    example: true 
  })
  success: true;

  @ApiProperty({ 
    description: 'Response payload data' 
  })
  data: T;

  @ApiPropertyOptional({ 
    description: 'Optional success message', 
    example: 'Operation completed successfully' 
  })
  message?: string;

  @ApiPropertyOptional({ 
    description: 'Optional metadata (pagination, timestamps, etc.)' 
  })
  meta?: ResponseMeta;
}

/**
 * Unified Error Response
 */
export class UnifiedErrorResponseDto {
  @ApiProperty({ 
    description: 'Indicates failed operation', 
    example: false 
  })
  success: false;

  @ApiProperty({ 
    description: 'Error information',
    type: ErrorDetailsDto
  })
  error: ErrorDetailsDto;

  @ApiPropertyOptional({ 
    description: 'Optional metadata' 
  })
  meta?: ResponseMeta;
}

/**
 * Union type for all possible responses
 */
export type UnifiedResponseDto<T = any> = 
  | UnifiedSuccessResponseDto<T> 
  | UnifiedErrorResponseDto;

/**
 * Helper function to create success responses
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string,
  meta?: ResponseMeta,
): UnifiedSuccessResponseDto<T> {
  const response: UnifiedSuccessResponseDto<T> = {
    success: true,
    data,
  };

  if (message) {
    response.message = message;
  }

  if (meta) {
    response.meta = meta;
  }

  return response;
}

/**
 * Helper function to create error responses
 */
export function createErrorResponse(
  code: number,
  message: string,
  details?: Record<string, any>,
  type?: string,
  meta?: ResponseMeta,
): UnifiedErrorResponseDto {
  const response: UnifiedErrorResponseDto = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (details) {
    response.error.details = details;
  }

  if (type) {
    response.error.type = type;
  }

  if (meta) {
    response.meta = meta;
  }

  return response;
}
