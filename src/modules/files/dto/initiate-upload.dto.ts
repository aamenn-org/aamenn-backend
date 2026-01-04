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
    description:
      'The original filename, encrypted by the client. Backend cannot decrypt this.',
    example: 'U2FsdGVkX1+abc123...encrypted_filename...',
    maxLength: 10000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
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
      'The file encryption key, encrypted with the user master key. Backend stores but cannot decrypt.',
    example: 'U2FsdGVkX1+xyz789...encrypted_key...',
    maxLength: 10000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
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
}
