import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShareItem } from '../../../database/entities/share-link.entity';

export class ShareLinkDto {
  @ApiProperty({ description: 'Share link ID' })
  id: string;

  @ApiProperty({ description: 'URL slug', example: 'my-vacation' })
  slug: string;

  @ApiProperty({
    description: 'Full share URL',
    example: 'https://app.aamenn.com/share/my-vacation#k=base64key',
  })
  url: string;

  @ApiProperty({
    description: 'Items included in this share',
    type: 'array',
  })
  items: ShareItem[];

  @ApiPropertyOptional({ description: 'Expiration timestamp', nullable: true })
  expiresAt: Date | null;

  @ApiPropertyOptional({ description: 'Revoked timestamp', nullable: true })
  revokedAt: Date | null;

  @ApiProperty({
    description: 'Share status',
    enum: ['active', 'expired', 'revoked'],
  })
  status: 'active' | 'expired' | 'revoked';

  @ApiProperty({ description: 'Created timestamp' })
  createdAt: Date;
}

export class CreateShareResponseDto {
  @ApiProperty({ type: ShareLinkDto })
  share: ShareLinkDto;
}

export class ListSharesResponseDto {
  @ApiProperty({ type: [ShareLinkDto] })
  shares: ShareLinkDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class RevokeShareResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Share link revoked' })
  message: string;
}

export interface SharedFileItem {
  type: 'file';
  fileId: string;
  cipherFileKey: string;
  fileNameEncrypted: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  downloadUrl: string;
  thumbSmallUrl: string | null;
  thumbMediumUrl: string | null;
  thumbLargeUrl: string | null;
  createdAt: Date;
}

export interface SharedFolderItem {
  type: 'folder';
  folderId: string;
  nameEncrypted: string;
}

export type SharedRootItem = SharedFileItem | SharedFolderItem;

export interface ResolveShareResponseDto {
  shareKey: string;
  fileKeys: Record<string, string>;
  fileNames: Record<string, string>;
  items: SharedRootItem[];
}

export interface BrowseShareFolderResponseDto {
  folderId: string;
  nameEncrypted: string;
  items: SharedRootItem[];
}

