import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString } from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Encrypted filename (base64) for renaming',
    example: 'ZW5jcnlwdGVkLWZpbGVuYW1lLWJhc2U2NA==',
    type: String,
  })
  @IsOptional()
  @IsString()
  fileNameEncrypted?: string;
}
