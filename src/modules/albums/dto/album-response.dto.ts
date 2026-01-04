import { ApiProperty } from '@nestjs/swagger';

/**
 * Album metadata in responses
 */
export class AlbumMetadataDto {
  @ApiProperty({
    description: 'Unique album ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  albumId: string;

  @ApiProperty({
    description: 'Encrypted album title (client-encrypted)',
    example: 'encrypted_base64_string...',
  })
  titleEncrypted: string;

  @ApiProperty({
    description: 'Number of files in the album',
    example: 42,
  })
  fileCount: number;

  @ApiProperty({
    description: 'Album creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;
}

/**
 * Response DTO for creating an album
 */
export class CreateAlbumResponseDto {
  @ApiProperty({
    description: 'Unique album ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  albumId: string;

  @ApiProperty({
    description: 'Encrypted album title',
    example: 'encrypted_base64_string...',
  })
  titleEncrypted: string;

  @ApiProperty({
    description: 'Album creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;
}

/**
 * Response DTO for getting an album
 */
export class GetAlbumResponseDto extends AlbumMetadataDto {}

/**
 * Response DTO for listing albums
 */
export class ListAlbumsResponseDto {
  @ApiProperty({
    description: 'Array of album metadata',
    type: [AlbumMetadataDto],
  })
  albums: AlbumMetadataDto[];
}

/**
 * Album file metadata with order index
 */
export class AlbumFileMetadataDto {
  @ApiProperty({
    description: 'Unique file ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  fileId: string;

  @ApiProperty({
    description: 'Encrypted filename (client-encrypted)',
    example: 'encrypted_base64_string...',
  })
  fileNameEncrypted: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'image/jpeg',
    nullable: true,
  })
  mimeType: string | null;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1048576,
    nullable: true,
  })
  sizeBytes: number | null;

  @ApiProperty({
    description: 'Order index of file in album',
    example: 0,
  })
  orderIndex: number;

  @ApiProperty({
    description: 'File creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;
}

/**
 * Response DTO for listing album files
 */
export class ListAlbumFilesResponseDto {
  @ApiProperty({
    description: 'Array of file metadata',
    type: [AlbumFileMetadataDto],
  })
  files: AlbumFileMetadataDto[];

  @ApiProperty({
    description: 'Pagination information',
    example: {
      page: 1,
      limit: 50,
      total: 150,
      totalPages: 3,
    },
  })
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Response DTO for adding files to album
 */
export class AddFilesToAlbumResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Number of files added',
    example: 5,
  })
  addedCount: number;

  @ApiProperty({
    description: 'Result message',
    example: 'Added 5 files to album',
  })
  message: string;
}

/**
 * Response DTO for album operations
 */
export class AlbumOperationResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Result message',
    example: 'Album deleted',
  })
  message: string;
}
