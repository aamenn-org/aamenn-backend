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

  @ApiPropertyOptional({
    description: 'Move file to a folder. Set to null to move to root.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  folderId?: string | null;
}
