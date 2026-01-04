import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for file upload initiation
 */
export class InitiateUploadResponseDto {
  @ApiProperty({
    description: 'Unique file ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  fileId: string;

  @ApiProperty({
    description: 'Signed URL for uploading the encrypted file to B2',
    example: 'https://pod-XXX-XXX.backblaze.com/b2api/v2/b2_upload_file/...',
  })
  uploadUrl: string;

  @ApiProperty({
    description: 'Authorization token for the upload',
    example: 'abc123...',
  })
  authorizationToken: string;

  @ApiProperty({
    description: 'File path in B2 storage',
    example: 'users/123/2024/01/file-uuid.enc',
  })
  b2FilePath: string;
}

/**
 * File metadata in responses
 */
export class FileMetadataDto {
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
    description: 'File creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'File last update timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt: Date;
}

/**
 * Response DTO for getting a single file
 */
export class GetFileResponseDto extends FileMetadataDto {
  @ApiProperty({
    description: 'Encrypted file key (for client-side decryption)',
    example: 'encrypted_key_base64...',
  })
  cipherFileKey: string;

  @ApiProperty({
    description: 'Signed URL for downloading the encrypted file',
    example: 'https://f000.backblazeb2.com/file/bucket-name/...',
  })
  downloadUrl: string;
}

/**
 * Response DTO for listing files
 */
export class ListFilesResponseDto {
  @ApiProperty({
    description: 'Array of file metadata',
    type: [FileMetadataDto],
  })
  files: FileMetadataDto[];

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
 * Response DTO for file deletion
 */
export class DeleteFileResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Result message',
    example: 'File deleted',
  })
  message: string;
}
