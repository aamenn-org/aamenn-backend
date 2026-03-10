import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FolderDto {
  @ApiProperty()
  folderId: string;

  @ApiProperty({ description: 'Encrypted folder name (zero-knowledge)' })
  nameEncrypted: string;

  @ApiPropertyOptional()
  parentFolderId: string | null;

  @ApiProperty()
  fileCount: number;

  @ApiProperty()
  subfolderCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class BreadcrumbItem {
  @ApiProperty()
  folderId: string;

  @ApiProperty({ description: 'Encrypted folder name (zero-knowledge)' })
  nameEncrypted: string;
}

export class LibraryResponseDto {
  @ApiPropertyOptional({ type: FolderDto })
  currentFolder: FolderDto | null;

  @ApiProperty({ type: [BreadcrumbItem] })
  breadcrumbs: BreadcrumbItem[];

  @ApiProperty({ type: [FolderDto] })
  folders: FolderDto[];

  @ApiProperty({ description: 'Files in this folder (paginated)' })
  files: any[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class FolderOperationResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;
}
