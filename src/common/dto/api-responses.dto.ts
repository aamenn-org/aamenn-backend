import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard pagination metadata for list responses
 */
export class PaginationMeta {
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
 * Standard success response
 */
export class SuccessResponseDto {
  @ApiProperty({ description: 'Operation success status', example: true })
  success: boolean;

  @ApiProperty({
    description: 'Human-readable message',
    example: 'Operation completed successfully',
  })
  message: string;
}

/**
 * Standard error response
 */
export class ErrorResponseDto {
  @ApiProperty({ description: 'HTTP status code', example: 400 })
  statusCode: number;

  @ApiProperty({ description: 'Error type', example: 'Bad Request' })
  error: string;

  @ApiProperty({ description: 'Error message', example: 'Validation failed' })
  message: string;
}
