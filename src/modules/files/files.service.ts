import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, IsNull, In } from 'typeorm';
import { File } from '../../database/entities/file.entity';
import {
  DownloadLog,
  DownloadType,
} from '../../database/entities/download-log.entity';
import { B2StorageService } from '../storage/b2-storage.service';
import { CacheService } from '../cache/cache.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';

// Import p-limit for concurrency control
import pLimit from 'p-limit';

interface ThumbnailData {
  thumbSmallBuffer: Buffer;
  thumbMediumBuffer: Buffer;
  thumbLargeBuffer: Buffer;
  width: number | null;
  height: number | null;
  duration?: number | null; // Video duration in seconds
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  
  // PERFORMANCE: Limit concurrent B2 uploads to prevent overwhelming the service
  // Max 5 concurrent uploads to B2 (configurable via env)
  private readonly uploadLimit = pLimit(
    parseInt(process.env.B2_UPLOAD_CONCURRENCY || '20', 10)
  );

  constructor(
    @InjectRepository(File)
    private filesRepository: Repository<File>,
    @InjectRepository(DownloadLog)
    private downloadLogsRepository: Repository<DownloadLog>,
    private b2StorageService: B2StorageService,
    private configService: ConfigService,
    private cacheService: CacheService,
  ) {
    // CRITICAL: ThumbnailService removed - backend NEVER processes plaintext images
    // All thumbnails must be generated and encrypted client-side
    this.logger.log(`B2 upload concurrency limit: ${this.uploadLimit.concurrency}`);
  }

  /**
   * Upload an encrypted avatar file.
   * Stores the file with isAvatar=true so it is excluded from gallery/folder listings.
   * Returns fileId and a signed download URL for immediate display.
   */
  async uploadAvatar(
    userId: string,
    dto: InitiateUploadDto,
    fileBuffer: Buffer,
    sha1Hash: string,
  ): Promise<{ fileId: string; downloadUrl: string }> {
    const b2FilePath = this.b2StorageService.generateFilePath(userId);

    await this.b2StorageService.uploadFile(b2FilePath, fileBuffer, sha1Hash);

    const file = this.filesRepository.create({
      userId,
      b2FilePath,
      cipherFileKey: dto.cipherFileKey,
      fileNameEncrypted: dto.fileNameEncrypted,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      isAvatar: true,
      folderId: null,
    });

    await this.filesRepository.save(file);

    const { downloadUrl } = await this.b2StorageService.getSignedDownloadUrl(b2FilePath);

    return { fileId: file.id, downloadUrl };
  }

  /**
   * Check if a file with the given content hash already exists for this user.
   * Returns the existing file info if found, including which albums it's in.
   */
  async checkDuplicate(userId: string, contentHash: string, albumId?: string) {
    // Find existing file with same hash
    const existingFile = await this.filesRepository.findOne({
      where: {
        userId,
        contentHash,
        deletedAt: IsNull(),
      },
    });

    if (!existingFile) {
      return {
        isDuplicate: false,
        existingFile: null,
        inSameAlbum: false,
      };
    }


    return {
      isDuplicate: true,
      existingFile: {
        id: existingFile.id,
        fileNameEncrypted: existingFile.fileNameEncrypted,
        mimeType: existingFile.mimeType,
        sizeBytes: existingFile.sizeBytes,
        width: existingFile.width,
        height: existingFile.height,
        createdAt: existingFile.createdAt,
      },
    };
  }

  /**
   * Upload file through backend (proxy upload).
   * This avoids CORS issues by uploading through the backend.
   * Also generates and uploads thumbnails for images.
   */
  async uploadFileProxy(
    userId: string,
    dto: InitiateUploadDto,
    fileBuffer: Buffer,
    sha1Hash: string,
  ) {
    // Generate file path for original
    const b2FilePath = this.b2StorageService.generateFilePath(userId);

    // Upload original file to B2
    await this.b2StorageService.uploadFile(b2FilePath, fileBuffer, sha1Hash);

    // Create file record with basic data
    const file = this.filesRepository.create({
      userId,
      b2FilePath,
      cipherFileKey: dto.cipherFileKey,
      fileNameEncrypted: dto.fileNameEncrypted,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      contentHash: dto.contentHash || null,
    });

    await this.filesRepository.save(file);

    return {
      fileId: file.id,
      b2FilePath: file.b2FilePath,
      cipherFileKey: file.cipherFileKey,
      fileNameEncrypted: file.fileNameEncrypted,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      duration: file.duration,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  /**
   * Upload file with thumbnails (for images).
   * All thumbnails are encrypted client-side before being stored.
   */
  async uploadFileWithThumbnails(
    userId: string,
    dto: InitiateUploadDto,
    fileBuffer: Buffer,
    sha1Hash: string,
    thumbnailData: ThumbnailData | null, // Now optional
  ) {
    this.logger.debug(
      `Starting file upload with thumbnails for user ${userId}`,
    );

    // Generate file path for original
    const b2FilePath = this.b2StorageService.generateFilePath(userId);

    // Generate thumbnail paths (optional for media files)
    let thumbSmallPath: string | null = null;
    let thumbMediumPath: string | null = null;
    let thumbLargePath: string | null = null;
    let uploadPromises: Promise<void>[] = [
      this.uploadLimit(() => this.b2StorageService.uploadFile(b2FilePath, fileBuffer, sha1Hash)),
    ];

    // Process thumbnails only if they exist
    if (thumbnailData) {
      thumbSmallPath = this.b2StorageService.generateFilePath(userId, 'thumb-small');
      thumbMediumPath = this.b2StorageService.generateFilePath(userId, 'thumb-medium');
      thumbLargePath = this.b2StorageService.generateFilePath(userId, 'thumb-large');

      // Compute thumbnail hashes in parallel (CPU-bound, fast)
      const [thumbSmallHash, thumbMediumHash, thumbLargeHash] = await Promise.all([
        this.computeSha1(thumbnailData.thumbSmallBuffer),
        this.computeSha1(thumbnailData.thumbMediumBuffer),
        this.computeSha1(thumbnailData.thumbLargeBuffer),
      ]);

      // Add thumbnail uploads to promises
      uploadPromises.push(
        this.uploadLimit(() => this.b2StorageService.uploadFile(
          thumbSmallPath!,
          thumbnailData.thumbSmallBuffer,
          thumbSmallHash,
        )),
        this.uploadLimit(() => this.b2StorageService.uploadFile(
          thumbMediumPath!,
          thumbnailData.thumbMediumBuffer,
          thumbMediumHash,
        )),
        this.uploadLimit(() => this.b2StorageService.uploadFile(
          thumbLargePath!,
          thumbnailData.thumbLargeBuffer,
          thumbLargeHash,
        ))
      );
    }

    await Promise.all(uploadPromises);
    this.logger.debug('All B2 uploads completed');

    // Create file record with all data
    const file = this.filesRepository.create({
      userId,
      b2FilePath,
      cipherFileKey: dto.cipherFileKey,
      fileNameEncrypted: dto.fileNameEncrypted,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      contentHash: dto.contentHash || null,
      folderId: dto.folderId || null,
      b2ThumbSmallPath: thumbSmallPath,
      b2ThumbMediumPath: thumbMediumPath,
      b2ThumbLargePath: thumbLargePath,
      width: thumbnailData?.width,
      height: thumbnailData?.height,
    });

    if (thumbnailData?.duration !== undefined) {
      file.duration = thumbnailData.duration;
    }

    await this.filesRepository.save(file);

    await this.cacheService.incrementVersion(userId, 'files');

    // Generate signed URLs for thumbnails only if they exist
    let thumbSmallResult = null;
    let thumbMediumResult = null;
    let thumbLargeResult = null;
    
    if (thumbSmallPath && thumbMediumPath && thumbLargePath) {
      [thumbSmallResult, thumbMediumResult, thumbLargeResult] = await Promise.all([
        this.b2StorageService.getSignedDownloadUrl(thumbSmallPath),
        this.b2StorageService.getSignedDownloadUrl(thumbMediumPath),
        this.b2StorageService.getSignedDownloadUrl(thumbLargePath),
      ]);
    }

    const thumbSmallUrl = thumbSmallResult?.downloadUrl;
    const thumbMediumUrl = thumbMediumResult?.downloadUrl;
    const thumbLargeUrl = thumbLargeResult?.downloadUrl;

    return {
      fileId: file.id,
      b2FilePath: file.b2FilePath,
      cipherFileKey: file.cipherFileKey,
      fileNameEncrypted: file.fileNameEncrypted,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      duration: file.duration,
      thumbSmallUrl,
      thumbMediumUrl,
      thumbLargeUrl,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  /**
   * Compute SHA1 hash of a buffer
   */
  private async computeSha1(buffer: Buffer): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha1').update(buffer).digest('hex');
  }

  /**
   * Log a file view request for statistics tracking.
   *
   * IMPORTANT: This is called when a download URL is GENERATED, not when the
   * actual download occurs. In our zero-knowledge architecture, we cannot track
   * actual B2 downloads since clients download directly from signed URLs.
   *
   * This metric represents "file view intents" - when a user requests access to a file.
   * The actual download may or may not occur after the URL is generated.
   *
   * @param userId - The user requesting the file
   * @param fileId - The file being requested
   * @param sizeBytes - The file size (used for bandwidth estimation)
   * @param downloadType - The type of asset (original, thumb_small, thumb_medium)
   */
  private async logDownload(
    userId: string,
    fileId: string,
    sizeBytes: number,
    downloadType: DownloadType,
  ): Promise<void> {
    const downloadLog = this.downloadLogsRepository.create({
      userId,
      fileId,
      sizeBytes,
      downloadType,
    });
    await this.downloadLogsRepository.save(downloadLog);
  }

  /**
   * Get multiple files metadata and download URLs in batch.
   * Optimized for viewer preloading - processes all files in parallel.
   */
  async getFilesBatch(fileIds: string[], userId: string) {
    // Fetch all files in one query
    const files = await this.filesRepository.find({
      where: { id: In(fileIds), userId, deletedAt: IsNull() },
    });

    // Process all files in parallel for maximum throughput
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        try {
          // Skip files with missing cipherFileKey (corrupted data)
          if (!file.cipherFileKey) {
            this.logger.warn(`Skipping file ${file.id} in batch - missing cipherFileKey`);
            return null;
          }

          // Get signed download URLs in parallel
          const promises = [
            this.b2StorageService.getSignedDownloadUrl(file.b2FilePath),
          ];
          
          // Add thumbnail URLs only if they exist
          if (file.b2ThumbSmallPath) {
            promises.push(this.b2StorageService.getSignedDownloadUrl(file.b2ThumbSmallPath));
          } else {
            promises.push(Promise.resolve(null) as Promise<any>);
          }
          if (file.b2ThumbMediumPath) {
            promises.push(this.b2StorageService.getSignedDownloadUrl(file.b2ThumbMediumPath));
          } else {
            promises.push(Promise.resolve(null) as Promise<any>);
          }
          if (file.b2ThumbLargePath) {
            promises.push(this.b2StorageService.getSignedDownloadUrl(file.b2ThumbLargePath));
          } else {
            promises.push(Promise.resolve(null) as Promise<any>);
          }

          const [downloadResult, thumbSmallResult, thumbMediumResult, thumbLargeResult] =
            await Promise.all(promises);

          // Log download for bandwidth tracking (fire and forget)
          this.logDownload(
            userId,
            file.id,
            file.sizeBytes || 0,
            DownloadType.ORIGINAL,
          ).catch((err) =>
            this.logger.warn(`Failed to log download: ${err.message}`),
          );

          return {
            fileId: file.id,
            cipherFileKey: file.cipherFileKey,
            fileNameEncrypted: file.fileNameEncrypted,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            width: file.width,
            height: file.height,
            duration: file.duration,
            downloadUrl: downloadResult.downloadUrl,
            thumbSmallUrl: thumbSmallResult.downloadUrl,
            thumbMediumUrl: thumbMediumResult.downloadUrl,
            thumbLargeUrl: thumbLargeResult.downloadUrl,
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
          };
        } catch (error) {
          this.logger.warn(`Failed to get URLs for file ${file.id}:`, error);
          return null;
        }
      }),
    );

    // Filter out failed files and maintain request order
    const validFiles = filesWithUrls.filter(
      (f): f is NonNullable<typeof f> => f !== null,
    );
    const fileMap = new Map(validFiles.map((f) => [f.fileId, f]));
    const orderedFiles = fileIds.map((id) => fileMap.get(id)).filter(Boolean);

    return { files: orderedFiles };
  }

  /**
   * Helper method to generate file metadata with signed URLs.
   * Used by multiple methods to avoid code duplication.
   */
  private async generateFilesWithUrls(files: File[]) {
    // Get signed URLs for small thumbnails (for grid view)
    return await Promise.all(
      files.map(async (file) => {
        let thumbSmallUrl = null;
        if (file.b2ThumbSmallPath) {
          const { downloadUrl } = await this.b2StorageService.getSignedDownloadUrl(
            file.b2ThumbSmallPath,
          );
          thumbSmallUrl = downloadUrl;
        }

        return {
          id: file.id,
          fileNameEncrypted: file.fileNameEncrypted,
          cipherFileKey: file.cipherFileKey,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          contentHash: file.contentHash,
          b2ThumbSmallPath: file.b2ThumbSmallPath,
          b2ThumbMediumPath: file.b2ThumbMediumPath,
          b2ThumbLargePath: file.b2ThumbLargePath,
          thumbSmallUrl,
          width: file.width,
          height: file.height,
          duration: file.duration,
          isFavorite: file.isFavorite,
          isAvatar: file.isAvatar,
          folderId: file.folderId,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        };
      }),
    );
  }


  /**
   * Check if a file exists and belongs to the user.
   */
  async verifyFileOwnership(fileId: string, userId: string): Promise<File> {
    const file = await this.filesRepository.findOne({
      where: { id: fileId, deletedAt: IsNull() },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return file;
  }

  /**
   * Get multiple files by IDs.
   * Only returns files owned by the specified user.
   */
  async getFilesByIds(fileIds: string[], userId: string): Promise<File[]> {
    if (fileIds.length === 0) return [];

    const files = await this.filesRepository
      .createQueryBuilder('file')
      .where('file.id IN (:...fileIds)', { fileIds })
      .andWhere('file.userId = :userId', { userId })
      .andWhere('file.deletedAt IS NULL')
      .getMany();

    return files;
  }

  /**
   * Update file properties (e.g., favorite status, filename).
   */
  async updateFile(
    fileId: string,
    userId: string,
    updates: { isFavorite?: boolean; fileNameEncrypted?: string; folderId?: string | null },
  ) {
    const file = await this.verifyFileOwnership(fileId, userId);

    if (updates.isFavorite !== undefined) {
      file.isFavorite = updates.isFavorite;
    }

    if (updates.fileNameEncrypted !== undefined) {
      file.fileNameEncrypted = updates.fileNameEncrypted;
    }

    if (updates.folderId !== undefined) {
      file.folderId = updates.folderId;
    }

    await this.filesRepository.save(file);

    await this.cacheService.incrementVersion(userId, 'files');

    return {
      fileId: file.id,
      isFavorite: file.isFavorite,
      fileNameEncrypted: file.fileNameEncrypted,
      folderId: file.folderId,
      updatedAt: file.updatedAt,
    };
  }


  /**
   * Move a file to trash (soft-delete).
   * Sets deletedAt timestamp without removing from B2 or albums.
   */
  async moveToTrash(fileId: string, userId: string) {
    const file = await this.verifyFileOwnership(fileId, userId);

    await this.filesRepository.softDelete({ id: fileId, userId });

    await this.cacheService.incrementVersion(userId, 'files');

    return { success: true, message: 'File moved to trash' };
  }

  /**
   * Move multiple files to trash (bulk operation).
   */
  async moveToTrashBulk(fileIds: string[], userId: string) {
    if (fileIds.length === 0) return { success: true, count: 0 };

    const count = await this.filesRepository
      .createQueryBuilder('file')
      .where('file.id IN (:...fileIds)', { fileIds })
      .andWhere('file.userId = :userId', { userId })
      .andWhere('file.deleted_at IS NULL')
      .getCount();

    if (count === 0) {
      throw new NotFoundException('No files found to move to trash');
    }

    await this.filesRepository.softDelete({ id: In(fileIds), userId });

    await this.cacheService.incrementVersion(userId, 'files');

    return { success: true, count };
  }

  /**
   * List files in trash for a user.
   */
  async listTrash(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ) {
    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const [files, total] = await this.filesRepository
      .createQueryBuilder('file')
      .where('file.userId = :userId', { userId })
      .andWhere('file.deleted_at IS NOT NULL')
      .withDeleted()
      .orderBy('file.deleted_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const filesWithUrls = await this.generateFilesWithUrls(files);

    return {
      files: filesWithUrls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Restore multiple files from trash (bulk operation).
   */
  async restoreFilesBulk(fileIds: string[], userId: string) {
    if (fileIds.length === 0) return { success: true, count: 0 };

    const count = await this.filesRepository
      .createQueryBuilder('file')
      .where('file.id IN (:...fileIds)', { fileIds })
      .andWhere('file.userId = :userId', { userId })
      .andWhere('file.deleted_at IS NOT NULL')
      .withDeleted()
      .getCount();

    if (count === 0) {
      throw new NotFoundException('No files found in trash to restore');
    }

    await this.filesRepository.restore({ id: In(fileIds), userId });

    await this.cacheService.incrementVersion(userId, 'files');

    return { success: true, count };
  }

  /**
   * Permanently delete a file from B2 storage and database.
   * Can target both active and trashed files.
   */
  async deleteFilePermanently(fileId: string, userId: string) {
    const file = await this.filesRepository
      .createQueryBuilder('file')
      .where('file.id = :fileId', { fileId })
      .andWhere('file.userId = :userId', { userId })
      .withDeleted()
      .getOne();

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Delete from B2 storage (main file + thumbnails in parallel)
    try {
      await this.b2StorageService.deleteFiles([
        file.b2FilePath,
        file.b2ThumbSmallPath,
        file.b2ThumbMediumPath,
        file.b2ThumbLargePath,
      ]);
    } catch (error) {
      this.logger.error(`Failed to delete file from B2: ${file.id}`, error);
      // Continue with database deletion even if B2 fails
    }


    // Permanently delete from database
    await this.filesRepository.remove(file);

    await this.cacheService.incrementVersion(userId, 'files');

    return { success: true, message: 'File permanently deleted' };
  }

  /**
   * Permanently delete multiple files (bulk operation).
   */
  async deleteFilesPermanentlyBulk(fileIds: string[], userId: string) {
    if (fileIds.length === 0) return { success: true, count: 0 };

    const files = await this.filesRepository
      .createQueryBuilder('file')
      .where('file.id IN (:...fileIds)', { fileIds })
      .andWhere('file.userId = :userId', { userId })
      .withDeleted()
      .getMany();

    if (files.length === 0) {
      throw new NotFoundException('No files found to delete');
    }

    // Delete from B2 in parallel
    await Promise.all(
      files.map(async (file) => {
        try {
          await this.b2StorageService.deleteFiles([
            file.b2FilePath,
            file.b2ThumbSmallPath,
            file.b2ThumbMediumPath,
            file.b2ThumbLargePath,
          ]);
        } catch (error) {
          this.logger.error(`Failed to delete file from B2: ${file.id}`, error);
        }
      }),
    );


    // Remove from database
    await this.filesRepository.remove(files);

    await this.cacheService.incrementVersion(userId, 'files');

    return { success: true, count: files.length };
  }

  /**
   * Empty trash - permanently delete all trashed files for a user.
   */
  async emptyTrash(userId: string) {
    const files = await this.filesRepository
      .createQueryBuilder('file')
      .where('file.userId = :userId', { userId })
      .andWhere('file.deleted_at IS NOT NULL')
      .withDeleted()
      .getMany();

    if (files.length === 0) {
      return { success: true, count: 0 };
    }

    const fileIds = files.map((f) => f.id);
    return this.deleteFilesPermanentlyBulk(fileIds, userId);
  }

  /**
   * Get storage usage for a user.
   * Returns current usage, limit, and whether exceeded.
   * Includes trashed files since they still occupy B2 storage.
   */
  async getStorageUsage(userId: string) {
    // Get total bytes used (including trashed files) and active file count
    const result = await this.filesRepository
      .createQueryBuilder('file')
      .select('COALESCE(SUM(file.sizeBytes), 0)', 'totalBytes')
      .addSelect('COUNT(CASE WHEN file.deletedAt IS NULL THEN 1 END)', 'fileCount')
      .where('file.userId = :userId', { userId })
      .getRawOne();

    const usedBytes = parseInt(result.totalBytes, 10) || 0;
    const fileCount = parseInt(result.fileCount, 10) || 0;
    const limitGb = this.configService.get<number>('storage.limitGb', 1);
    const limitBytes = limitGb * 1024 * 1024 * 1024; // Convert GB to bytes
    const usedGb = usedBytes / (1024 * 1024 * 1024);

    return {
      usedBytes,
      usedGb: Math.round(usedGb * 100) / 100, // Round to 2 decimal places
      limitBytes,
      limitGb,
      fileCount,
      exceeded: usedBytes >= limitBytes,
      percentUsed: Math.min(Math.round((usedBytes / limitBytes) * 100), 100),
    };
  }
}
