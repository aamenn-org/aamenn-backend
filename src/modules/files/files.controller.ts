import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { ListFilesQueryDto } from './dto/list-files-query.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import {
  GetFileResponseDto,
  ListFilesResponseDto,
  DeleteFileResponseDto,
} from './dto/file-response.dto';
import { ErrorResponseDto } from '../../common/dto';

@ApiTags('Files')
@ApiBearerAuth('JWT-auth')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}


  /**
   * Check if a file with the given content hash already exists.
   * This is used for duplicate detection before uploading.
   *
   * Returns existing file info if duplicate found, null otherwise.
   */
  @Get('check-duplicate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check for duplicate file',
    description: `Check if a file with the same content hash already exists.

**Zero-Knowledge Preserved:**
- Only the hash is checked, not the actual content
- Hash reveals that two files are identical, but not WHAT the content is

**Client workflow:**
1. Compute SHA-256 hash of original file (before encryption)
2. Call this endpoint with the hash
3. If duplicate found, skip upload or create symlink
4. If no duplicate, proceed with normal upload`,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Duplicate check result',
  })
  async checkDuplicate(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query('hash') hash: string,
    @Query('albumId') albumId?: string,
  ) {
    if (!hash || hash.length !== 64) {
      throw new BadRequestException(
        'Invalid hash. Expected SHA-256 (64 hex characters)',
      );
    }

    return this.filesService.checkDuplicate(authUser.userId, hash, albumId);
  }

  /**
   * Upload file through backend (proxy upload).
   * This avoids CORS issues by uploading through the backend.
   * Handles both files with and without thumbnails.
   * Backend never sees plaintext - only encrypted blob.
   *
   * Client workflow:
   * 1. Encrypt file locally
   * 2. Generate & encrypt thumbnails if applicable
   * 3. POST to this endpoint with encrypted file as multipart form data
   * 4. Backend proxies encrypted file to B2
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max encrypted file size
        fieldSize: 10 * 1024 * 1024, // 10MB max field size (for base64 encrypted thumbnails)
      },
    }),
  )
  @ApiOperation({
    summary: 'Upload encrypted file (TRUE E2EE)',
    description: `Upload encrypted file and encrypted thumbnails.
    
**CRITICAL - True Zero-Knowledge Flow:**
1. Client generates thumbnails from PLAINTEXT image (client-side only)
2. Client encrypts: original file + 3 thumbnails (small/medium/large) with master key
3. Client uploads ONLY encrypted blobs to this endpoint
4. Backend proxies encrypted blobs to B2 storage
5. Backend NEVER sees plaintext data at any stage

**Backend Guarantees:**
- Backend receives ONLY encrypted data
- Backend NEVER decrypts any user data
- Backend NEVER processes plaintext images
- Backend validates ONLY encrypted blob sizes

**Required Fields:**
- file: Encrypted file blob (multipart)
- thumbSmall: Base64-encoded encrypted thumbnail (150x150)
- thumbMedium: Base64-encoded encrypted thumbnail (800x800)
- thumbLarge: Base64-encoded encrypted thumbnail (1600x1600)
- cipherFileKey
- width, height (generated client-side from plaintext)

**Size Limits (on encrypted data):**
- thumbSmall: 500KB max
- thumbMedium: 2MB max
- thumbLarge: 10MB max`,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Encrypted file uploaded successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid encrypted data or size limit exceeded',
  })
  async uploadFile(
    @CurrentUser() authUser: AuthenticatedUser,
    @UploadedFile() file: any,
    @Body('fileNameEncrypted') fileNameEncrypted: string,
    @Body('cipherFileKey') cipherFileKey: string,
    @Body('mimeType') mimeType: string,
    @Body('sha1Hash') sha1Hash: string,
    @Body('thumbSmall') thumbSmallBase64?: string,
    @Body('thumbMedium') thumbMediumBase64?: string,
    @Body('thumbLarge') thumbLargeBase64?: string,
    @Body('width') width?: string,
    @Body('height') height?: string,
    @Body('duration') duration?: string,
    @Body('contentHash') contentHash?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const dto: InitiateUploadDto = {
      fileNameEncrypted,
      cipherFileKey,
      mimeType,
      sizeBytes: file.size,
      contentHash: contentHash || undefined,
    };

    // Parse encrypted thumbnails from base64 (optional for media files)
    let thumbnailData = null;
    
    if (thumbSmallBase64 && thumbMediumBase64 && thumbLargeBase64) {
      // Decode encrypted thumbnail blobs
      const thumbSmallBuffer = Buffer.from(thumbSmallBase64, 'base64');
      const thumbMediumBuffer = Buffer.from(thumbMediumBase64, 'base64');
      const thumbLargeBuffer = Buffer.from(thumbLargeBase64, 'base64');

      // CRITICAL: Validate encrypted thumbnail sizes
      const MAX_THUMB_SMALL = 500 * 1024; // 500KB
      const MAX_THUMB_MEDIUM = 2 * 1024 * 1024; // 2MB
      const MAX_THUMB_LARGE = 10 * 1024 * 1024; // 10MB

      if (thumbSmallBuffer.length > MAX_THUMB_SMALL) {
        throw new BadRequestException(
          `Encrypted small thumbnail exceeds ${MAX_THUMB_SMALL / 1024}KB limit`
        );
      }
      if (thumbMediumBuffer.length > MAX_THUMB_MEDIUM) {
        throw new BadRequestException(
          `Encrypted medium thumbnail exceeds ${MAX_THUMB_MEDIUM / (1024 * 1024)}MB limit`
        );
      }
      if (thumbLargeBuffer.length > MAX_THUMB_LARGE) {
        throw new BadRequestException(
          `Encrypted large thumbnail exceeds ${MAX_THUMB_LARGE / (1024 * 1024)}MB limit`
        );
      }

      thumbnailData = {
        thumbSmallBuffer,
        thumbMediumBuffer,
        thumbLargeBuffer,
        width: width ? parseInt(width, 10) : null,
        height: height ? parseInt(height, 10) : null,
        duration: duration ? parseInt(duration, 10) : null,
      };
    }

    // Upload encrypted blobs - backend treats all data as opaque encrypted bytes
    return this.filesService.uploadFileWithThumbnails(
      authUser.userId,
      dto,
      file.buffer,
      sha1Hash,
      thumbnailData,
    );
  }


  /**
   * Get multiple files metadata in batch.
   * Optimized for viewer preloading - returns download URLs for all requested files.
   */
  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get multiple files metadata',
    description: `Returns metadata and download URLs for multiple files in a single request.
    
**Use Case:** Viewer preloading - fetch metadata for adjacent images in batch to minimize request overhead.

**Performance:** Much more efficient than calling GET /files/:id multiple times.`,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Array of file metadata with download URLs',
  })
  async getFilesBatch(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body('fileIds') fileIds: string[],
  ) {
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return { files: [] };
    }

    // Limit batch size to prevent abuse
    const limitedIds = fileIds.slice(0, 25);

    return this.filesService.getFilesBatch(limitedIds, authUser.userId);
  }

  /**
   * List files in trash.
   */
  @Get('trash')
  @ApiOperation({
    summary: 'List trash',
    description: 'Returns paginated list of files in trash.',
  })
  async listTrash(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query() query: ListFilesQueryDto,
  ) {
    return this.filesService.listTrash(authUser.userId, {
      page: query.page,
      limit: query.limit,
    });
  }

  /**
   * Get file metadata and signed download URL.
   *
   * Client workflow:
   * 1. Call this endpoint
   * 2. Download encrypted file from B2 using returned URL
   * 3. Decrypt file locally using cipherFileKey
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get file',
    description: `Returns file metadata and a signed download URL.
    
**Zero-Knowledge Flow:**
1. Client calls this endpoint
2. Backend returns encrypted metadata + signed download URL
3. Client downloads encrypted file from B2
4. Client decrypts file locally using the cipherFileKey

Backend never decrypts file data.`,
  })
  @ApiParam({
    name: 'id',
    description: 'File UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'File metadata and download URL',
    type: GetFileResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'File not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied',
    type: ErrorResponseDto,
  })
  async getFile(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) fileId: string,
  ): Promise<GetFileResponseDto> {
    return this.filesService.getFile(fileId, authUser.userId);
  }

  /**
   * List user's files with pagination and optional filters.
   */
  @Get()
  @ApiOperation({
    summary: 'List files',
    description:
      'Returns paginated list of user files with encrypted metadata. Use ?favorite=true to list only favorites.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated list of files',
    type: ListFilesResponseDto,
  })
  async listFiles(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query() query: ListFilesQueryDto,
  ): Promise<ListFilesResponseDto> {
    return this.filesService.listFiles(authUser.userId, {
      page: query.page,
      limit: query.limit,
      favorite: query.favorite,
    });
  }

  /**
   * Update file properties (e.g., favorite status).
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update file',
    description: 'Update file properties such as favorite status.',
  })
  @ApiParam({
    name: 'id',
    description: 'File UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'File updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'File not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied',
    type: ErrorResponseDto,
  })
  async updateFile(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) fileId: string,
    @Body() dto: UpdateFileDto,
  ) {
    return this.filesService.updateFile(fileId, authUser.userId, dto);
  }

  /**
   * Move multiple files to trash (bulk).
   */
  @Post('trash')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move files to trash (bulk)',
    description: 'Soft-deletes multiple files by moving them to trash.',
  })
  async moveToTrashBulk(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body('fileIds') fileIds: string[],
  ) {
    return this.filesService.moveToTrashBulk(fileIds, authUser.userId);
  }

  /**
   * Restore multiple files from trash (bulk).
   */
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore files from trash (bulk)',
    description: 'Restores multiple files from trash to active state.',
  })
  async restoreFilesBulk(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body('fileIds') fileIds: string[],
  ) {
    return this.filesService.restoreFilesBulk(fileIds, authUser.userId);
  }

  /**
   * Permanently delete multiple files (bulk).
   */
  @Post('purge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Permanently delete files (bulk)',
    description: 'Permanently deletes multiple files. Cannot be undone.',
  })
  async purgeFiles(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body('fileIds') fileIds: string[],
  ) {
    return this.filesService.deleteFilesPermanentlyBulk(fileIds, authUser.userId);
  }

  /**
   * Empty trash - permanently delete all trashed files.
   */
  @Post('trash/empty')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Empty trash',
    description: 'Permanently deletes all files in trash. Cannot be undone.',
  })
  async emptyTrash(@CurrentUser() authUser: AuthenticatedUser) {
    return this.filesService.emptyTrash(authUser.userId);
  }

  /**
   * Move file to trash (soft-delete).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move file to trash',
    description: 'Soft-deletes a file by moving it to trash. Can be restored later.',
  })
  @ApiParam({
    name: 'id',
    description: 'File UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'File moved to trash',
  })
  async deleteFile(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) fileId: string,
  ) {
    return this.filesService.moveToTrash(fileId, authUser.userId);
  }

  /**
   * Restore a file from trash.
   */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore file from trash',
    description: 'Restores a file from trash to active state.',
  })
  @ApiParam({
    name: 'id',
    description: 'File UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  async restoreFile(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) fileId: string,
  ) {
    return this.filesService.restoreFile(fileId, authUser.userId);
  }

  /**
   * Permanently delete a file.
   */
  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Permanently delete file',
    description: 'Permanently deletes a file. Removes from B2 storage and database. Cannot be undone.',
  })
  @ApiParam({
    name: 'id',
    description: 'File UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  async deleteFilePermanently(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) fileId: string,
  ) {
    return this.filesService.deleteFilePermanently(fileId, authUser.userId);
  }

}
