import { ApiProperty } from '@nestjs/swagger';
import { ShareResourceType } from '../../../database/entities/share-link.entity';

export class ShareLinkDto {
  @ApiProperty({
    description: 'Share link ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'URL slug',
    example: 'my-vacation-photo',
  })
  slug: string;

  @ApiProperty({
    description: 'Full share URL',
    example: 'https://app.aamenn.com/share/my-vacation-photo#k=base64key',
  })
  url: string;

  @ApiProperty({
    description: 'Resource type',
    enum: ShareResourceType,
  })
  resourceType: ShareResourceType;

  @ApiProperty({
    description: 'Resource ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  resourceId: string;

  @ApiProperty({
    description: 'Expiration timestamp',
    example: '2024-12-31T23:59:59.000Z',
    nullable: true,
  })
  expiresAt: Date | null;

  @ApiProperty({
    description: 'Revoked timestamp',
    example: null,
    nullable: true,
  })
  revokedAt: Date | null;

  @ApiProperty({
    description: 'Share status',
    enum: ['active', 'expired', 'revoked'],
    example: 'active',
  })
  status: 'active' | 'expired' | 'revoked';

  @ApiProperty({
    description: 'Created timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: Date;
}

export class CreateSharesResponseDto {
  @ApiProperty({
    description: 'Created share links',
    type: [ShareLinkDto],
  })
  shares: ShareLinkDto[];
}

export class ListSharesResponseDto {
  @ApiProperty({
    description: 'Share links',
    type: [ShareLinkDto],
  })
  shares: ShareLinkDto[];

  @ApiProperty({
    description: 'Pagination metadata',
  })
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class RevokeShareResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Message',
    example: 'Share link revoked',
  })
  message: string;
}

export class ResolveShareFileResponseDto {
  @ApiProperty({
    description: 'File ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  fileId: string;

  @ApiProperty({
    description: 'Encrypted file key',
    example: 'base64encryptedkey...',
  })
  cipherFileKey: string;

  @ApiProperty({
    description: 'Encrypted filename',
    example: 'base64encryptedfilename...',
  })
  fileNameEncrypted: string;

  @ApiProperty({
    description: 'MIME type',
    example: 'image/jpeg',
  })
  mimeType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1024000,
  })
  sizeBytes: number;

  @ApiProperty({
    description: 'Image width',
    example: 1920,
    nullable: true,
  })
  width: number | null;

  @ApiProperty({
    description: 'Image height',
    example: 1080,
    nullable: true,
  })
  height: number | null;

  @ApiProperty({
    description: 'Video duration in seconds',
    example: 120,
    nullable: true,
  })
  duration: number | null;

  @ApiProperty({
    description: 'Download URL for encrypted file',
    example: 'https://...',
  })
  downloadUrl: string;

  @ApiProperty({
    description: 'Small thumbnail URL',
    example: 'https://...',
    nullable: true,
  })
  thumbSmallUrl: string | null;

  @ApiProperty({
    description: 'Medium thumbnail URL',
    example: 'https://...',
    nullable: true,
  })
  thumbMediumUrl: string | null;

  @ApiProperty({
    description: 'Large thumbnail URL',
    example: 'https://...',
    nullable: true,
  })
  thumbLargeUrl: string | null;

  @ApiProperty({
    description: 'Created timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: Date;
}

export class ResolveShareAlbumFileDto {
  @ApiProperty()
  fileId: string;

  @ApiProperty()
  fileNameEncrypted: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty({ nullable: true })
  width: number | null;

  @ApiProperty({ nullable: true })
  height: number | null;

  @ApiProperty({ nullable: true })
  duration: number | null;

  @ApiProperty({ nullable: true })
  thumbSmallUrl: string | null;

  @ApiProperty()
  orderIndex: number;

  @ApiProperty()
  createdAt: Date;
}

export class ResolveShareAlbumResponseDto {
  @ApiProperty({
    description: 'Album ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  albumId: string;

  @ApiProperty({
    description: 'Encrypted album title',
    example: 'base64encryptedtitle...',
  })
  titleEncrypted: string;

  @ApiProperty({
    description: 'Files in the album',
    type: [ResolveShareAlbumFileDto],
  })
  files: ResolveShareAlbumFileDto[];

  @ApiProperty({
    description: 'Pagination metadata',
  })
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
