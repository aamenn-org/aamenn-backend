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
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload file (proxy through backend)',
    description: `Upload encrypted file through backend to avoid CORS issues.
    
**Zero-Knowledge Flow:**
1. Client encrypts file locally
2. Client optionally generates & encrypts thumbnails
3. Client uploads encrypted file to this endpoint
4. Backend proxies encrypted file to B2
5. Backend creates file record

Backend never sees plaintext file data - only encrypted blob.

**Thumbnails (optional):**
Include thumbSmall, thumbMedium, cipherThumbSmallKey, cipherThumbMediumKey, blurhash, width, height for images/videos.`,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'File uploaded successfully',
  })
  async uploadFile(
    @CurrentUser() authUser: AuthenticatedUser,
    @UploadedFile() file: any,
    @Body('fileNameEncrypted') fileNameEncrypted: string,
    @Body('cipherFileKey') cipherFileKey: string,
    @Body('mimeType') mimeType: string,
    @Body('sha1Hash') sha1Hash: string,
    @Body('contentHash') contentHash?: string,
    @Body('cipherThumbSmallKey') cipherThumbSmallKey?: string,
    @Body('cipherThumbMediumKey') cipherThumbMediumKey?: string,
    @Body('thumbSmall') thumbSmallBase64?: string,
    @Body('thumbMedium') thumbMediumBase64?: string,
    @Body('blurhash') blurhash?: string,
    @Body('width') width?: string,
    @Body('height') height?: string,
    @Body('duration') duration?: string,
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

    // Parse thumbnails from base64 if provided
    let thumbnailData = undefined;
    if (
      thumbSmallBase64 &&
      thumbMediumBase64 &&
      cipherThumbSmallKey &&
      cipherThumbMediumKey
    ) {
      thumbnailData = {
        cipherThumbSmallKey,
        cipherThumbMediumKey,
        thumbSmallBuffer: Buffer.from(thumbSmallBase64, 'base64'),
        thumbMediumBuffer: Buffer.from(thumbMediumBase64, 'base64'),
        blurhash: blurhash || null,
        width: width ? parseInt(width, 10) : null,
        height: height ? parseInt(height, 10) : null,
        duration: duration ? parseInt(duration, 10) : null,
      };
    }

    // Use unified upload method - handles both with and without thumbnails
    if (thumbnailData) {
      return this.filesService.uploadFileWithThumbnails(
        authUser.userId,
        dto,
        file.buffer,
        sha1Hash,
        thumbnailData,
      );
    } else {
      return this.filesService.uploadFileProxy(
        authUser.userId,
        dto,
        file.buffer,
        sha1Hash,
      );
    }
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
   * Permanently delete a file.
   * Removes file from B2 storage and database.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete file permanently',
    description:
      'Permanently deletes a file. Removes from B2 storage and database.',
  })
  @ApiParam({
    name: 'id',
    description: 'File UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'File deleted',
    type: DeleteFileResponseDto,
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
  async deleteFile(
    @CurrentUser() authUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) fileId: string,
  ): Promise<DeleteFileResponseDto> {
    return this.filesService.deleteFile(fileId, authUser.userId);
  }

}
