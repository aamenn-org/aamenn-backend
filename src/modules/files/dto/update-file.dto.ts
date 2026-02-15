import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

/**
 * DTO for updating file properties
 */
export class UpdateFileDto {
  @ApiPropertyOptional({
    description: 'Set favorite status',
    example: true,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}
