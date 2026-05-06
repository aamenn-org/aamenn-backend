import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class StartUploadDto {
  @ApiProperty({ description: 'Encrypted filename (base64)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  fileNameEncrypted: string;

  @ApiProperty({ description: 'File encryption key encrypted with master key (base64)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  cipherFileKey: string;

  @ApiPropertyOptional({ description: 'MIME type of the original file' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiProperty({ description: 'Total size of the encrypted file in bytes', minimum: 1 })
  @IsNumber()
  @Min(1)
  totalBytes: number;

  @ApiProperty({ description: 'Chunk size in bytes chosen by the client', minimum: 5242880 })
  @IsNumber()
  @Min(5 * 1024 * 1024) // B2 minimum part size: 5MB
  chunkSizeBytes: number;

  @ApiProperty({ description: 'Total number of parts', minimum: 1, maximum: 10000 })
  @IsNumber()
  @Min(1)
  @Max(10000)
  totalParts: number;

  @ApiPropertyOptional({ description: 'SHA-256 hash of the original file content' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contentHash?: string;

  @ApiPropertyOptional({ description: 'Target folder ID' })
  @IsOptional()
  @IsString()
  folderId?: string;

  @ApiPropertyOptional({ description: 'Image/video width in pixels' })
  @IsOptional()
  @IsNumber()
  width?: number;

  @ApiPropertyOptional({ description: 'Image/video height in pixels' })
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional({ description: 'Video duration in seconds' })
  @IsOptional()
  @IsNumber()
  duration?: number;
}
