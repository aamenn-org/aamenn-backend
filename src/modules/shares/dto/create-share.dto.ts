import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShareItemType } from '../../../database/entities/share-link.entity';

export class ShareItemDto {
  @ApiProperty({
    description: 'Type of item',
    enum: ['file', 'folder'],
    example: 'file',
  })
  @IsIn(['file', 'folder'])
  @IsNotEmpty()
  type: ShareItemType;

  @ApiProperty({
    description: 'UUID of the file or folder',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  id: string;
}

export class CreateShareDto {
  @ApiProperty({
    description: 'Items to include in this share (files and/or folders)',
    type: [ShareItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShareItemDto)
  items: ShareItemDto[];

  @ApiProperty({
    description: 'Base slug for the share URL',
    example: 'my-vacation',
  })
  @IsString()
  @IsNotEmpty()
  slugBase: string;

  @ApiProperty({
    description: 'Encrypted share title (title encrypted with shareKeyRaw)',
    example: 'base64encodedkey...',
  })
  @IsString()
  @IsNotEmpty()
  shareKey: string;

  @ApiPropertyOptional({
    description: 'Re-encrypted file keys: { fileId -> encryptedKey }',
  })
  @IsOptional()
  @IsObject()
  fileKeys?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Expiration duration in seconds (omit for no expiration)',
    example: 86400,
  })
  @IsOptional()
  @IsNumber()
  @Min(60)
  expiresInSeconds?: number | null;
}
