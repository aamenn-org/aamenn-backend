import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ShareResourceType } from '../../../database/entities/share-link.entity';

export class CreateShareItemDto {
  @ApiProperty({
    description: 'Type of resource to share',
    enum: ShareResourceType,
    example: ShareResourceType.FILE,
  })
  @IsEnum(ShareResourceType)
  @IsNotEmpty()
  type: ShareResourceType;

  @ApiProperty({
    description: 'UUID of the file or album to share',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Base slug for the share URL (derived from filename/album name)',
    example: 'my-vacation-photo',
  })
  @IsString()
  @IsNotEmpty()
  slugBase: string;

  @ApiProperty({
    description: 'Share decryption key (base64-encoded encrypted key)',
    example: 'base64encodedkey...',
  })
  @IsString()
  @IsNotEmpty()
  shareKey: string;

  @ApiProperty({
    description: 'Expiration duration in seconds (null = no expiration)',
    example: 86400,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(60)
  expiresInSeconds?: number | null;
}

export class CreateSharesDto {
  @ApiProperty({
    description: 'Array of items to share',
    type: [CreateShareItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateShareItemDto)
  items: CreateShareItemDto[];
}
