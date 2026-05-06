import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';

/**
 * DTO for initiating a file upload
 * All sensitive data is encrypted client-side before sending
 */
export class InitiateUploadDto {
  @ApiProperty({
    description: 'Encrypted filename (base64)',
    example: 'base64EncodedEncryptedFilename...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000) // Reasonable limit for encrypted filename
  fileNameEncrypted: string;

  @ApiPropertyOptional({
    description: 'MIME type of the file (e.g., image/jpeg)',
    example: 'image/jpeg',
  })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({
    description: 'Size of the encrypted file in bytes',
    example: 1048576,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  sizeBytes?: number;

  @ApiProperty({
    description:
      'File encryption key encrypted with master key (base64). Format: IV(12 bytes) + ciphertext + authTag(16 bytes)',
    example: 'base64EncodedEncryptedFileKey...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000) // Reasonable limit for encrypted key
  cipherFileKey: string;

  @ApiPropertyOptional({
    description:
      'SHA-256 hash of the ORIGINAL file content (before encryption). Used for duplicate detection.',
    example: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contentHash?: string;

  @ApiPropertyOptional({
    description: 'Target folder ID. NULL or omitted for root level.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  folderId?: string;
}
