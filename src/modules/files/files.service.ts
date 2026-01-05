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
import { AlbumFile } from '../../database/entities/album-file.entity';
import { B2StorageService } from '../storage/b2-storage.service';
import { ThumbnailService } from './thumbnail.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';

interface ThumbnailData {
  cipherThumbSmallKey: string;
  cipherThumbMediumKey: string;
  thumbSmallBuffer: Buffer;
  thumbMediumBuffer: Buffer;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  duration?: number | null; // Video duration in seconds
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectRepository(File)
    private filesRepository: Repository<File>,
    @InjectRepository(AlbumFile)
    private albumFilesRepository: Repository<AlbumFile>,
    private b2StorageService: B2StorageService,
    private thumbnailService: ThumbnailService,
    private configService: ConfigService,
  ) {}

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
      relations: ['albumFiles'],
    });

    if (!existingFile) {
      return {
        isDuplicate: false,
        existingFile: null,
        inSameAlbum: false,
      };
    }

    // Check if the file is already in the target album
    const inSameAlbum = albumId
      ? existingFile.albumFiles?.some((af) => af.albumId === albumId)
      : false;

    return {
      isDuplicate: true,
      existingFile: {
        id: existingFile.id,
        fileNameEncrypted: existingFile.fileNameEncrypted,
        mimeType: existingFile.mimeType,
        sizeBytes: existingFile.sizeBytes,
        blurhash: existingFile.blurhash,
        width: existingFile.width,
        height: existingFile.height,
        createdAt: existingFile.createdAt,
      },
      inSameAlbum,
      albumIds: existingFile.albumFiles?.map((af) => af.albumId) || [],
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
      blurhash: file.blurhash,
      width: file.width,
      height: file.height,
      duration: file.duration,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  /**
   * Upload file with thumbnails (for images).
   * Generates small and medium thumbnails, plus blurhash.
   * All thumbnails are encrypted client-side before being stored.
   */
  async uploadFileWithThumbnails(
    userId: string,
    dto: InitiateUploadDto & {
      cipherThumbSmallKey?: string;
      cipherThumbMediumKey?: string;
    },
    fileBuffer: Buffer,
    sha1Hash: string,
    thumbnailData?: ThumbnailData,
  ) {
    this.logger.debug(
      `Starting file upload with thumbnails for user ${userId}`,
    );

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

    // If thumbnail data is provided, upload thumbnails
    if (thumbnailData) {
      this.logger.debug('Uploading thumbnails...');

      // Generate thumbnail paths
      const thumbSmallPath = this.b2StorageService.generateFilePath(
        userId,
        'thumb-small',
      );
      const thumbMediumPath = this.b2StorageService.generateFilePath(
        userId,
        'thumb-medium',
      );

      // Upload thumbnails to B2 in parallel
      await Promise.all([
        this.b2StorageService.uploadFile(
          thumbSmallPath,
          thumbnailData.thumbSmallBuffer,
          await this.computeSha1(thumbnailData.thumbSmallBuffer),
        ),
        this.b2StorageService.uploadFile(
          thumbMediumPath,
          thumbnailData.thumbMediumBuffer,
          await this.computeSha1(thumbnailData.thumbMediumBuffer),
        ),
      ]);

      // Update file record with thumbnail data
      file.b2ThumbSmallPath = thumbSmallPath;
      file.b2ThumbMediumPath = thumbMediumPath;
      file.cipherThumbSmallKey = thumbnailData.cipherThumbSmallKey;
      file.cipherThumbMediumKey = thumbnailData.cipherThumbMediumKey;
      file.blurhash = thumbnailData.blurhash;
      file.width = thumbnailData.width;
      file.height = thumbnailData.height;
      if (thumbnailData.duration !== undefined) {
        file.duration = thumbnailData.duration;
      }

      this.logger.debug('Thumbnails uploaded successfully');
    }

    await this.filesRepository.save(file);

    return {
      fileId: file.id,
      b2FilePath: file.b2FilePath,
      cipherFileKey: file.cipherFileKey,
      fileNameEncrypted: file.fileNameEncrypted,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      blurhash: file.blurhash,
      width: file.width,
      height: file.height,
      duration: file.duration,
      hasThumbnails: !!thumbnailData,
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
          // Get signed download URLs in parallel
          const [downloadResult, thumbSmallResult, thumbMediumResult] =
            await Promise.all([
              this.b2StorageService.getSignedDownloadUrl(file.b2FilePath),
              file.b2ThumbSmallPath
                ? this.b2StorageService.getSignedDownloadUrl(
                    file.b2ThumbSmallPath,
                  )
                : Promise.resolve(null),
              file.b2ThumbMediumPath
                ? this.b2StorageService.getSignedDownloadUrl(
                    file.b2ThumbMediumPath,
                  )
                : Promise.resolve(null),
            ]);

          return {
            fileId: file.id,
            cipherFileKey: file.cipherFileKey,
            cipherThumbSmallKey: file.cipherThumbSmallKey,
            cipherThumbMediumKey: file.cipherThumbMediumKey,
            fileNameEncrypted: file.fileNameEncrypted,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            blurhash: file.blurhash,
            width: file.width,
            height: file.height,
            duration: file.duration,
            downloadUrl: downloadResult.downloadUrl,
            thumbSmallUrl: thumbSmallResult?.downloadUrl || null,
            thumbMediumUrl: thumbMediumResult?.downloadUrl || null,
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
   * Get file metadata and download URL.
   * Verifies ownership before returning data.
   */
  async getFile(fileId: string, userId: string) {
    const file = await this.filesRepository.findOne({
      where: { id: fileId, deletedAt: IsNull() },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Verify ownership
    if (file.userId !== userId) {
      // TODO: Check for shared access in future implementation
      throw new ForbiddenException('Access denied');
    }

    // Get signed download URL for original file
    const { downloadUrl } = await this.b2StorageService.getSignedDownloadUrl(
      file.b2FilePath,
    );

    // Get thumbnail URLs if available
    let thumbSmallUrl: string | null = null;
    let thumbMediumUrl: string | null = null;

    if (file.b2ThumbSmallPath) {
      const result = await this.b2StorageService.getSignedDownloadUrl(
        file.b2ThumbSmallPath,
      );
      thumbSmallUrl = result.downloadUrl;
    }

    if (file.b2ThumbMediumPath) {
      const result = await this.b2StorageService.getSignedDownloadUrl(
        file.b2ThumbMediumPath,
      );
      thumbMediumUrl = result.downloadUrl;
    }

    return {
      fileId: file.id,
      cipherFileKey: file.cipherFileKey,
      cipherThumbSmallKey: file.cipherThumbSmallKey,
      cipherThumbMediumKey: file.cipherThumbMediumKey,
      fileNameEncrypted: file.fileNameEncrypted,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      blurhash: file.blurhash,
      width: file.width,
      height: file.height,
      duration: file.duration,
      downloadUrl,
      thumbSmallUrl,
      thumbMediumUrl,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  /**
   * List all files for a user.
   * Returns metadata with blurhash and thumbnail keys for grid view.
   * Includes signed URLs for small thumbnails.
   */
  async listFiles(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ) {
    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const [files, total] = await this.filesRepository.findAndCount({
      where: { userId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Get signed URLs for small thumbnails in parallel
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        let thumbSmallUrl: string | null = null;

        // Only fetch thumbnail URL if thumbnail exists
        if (file.b2ThumbSmallPath) {
          try {
            const result = await this.b2StorageService.getSignedDownloadUrl(
              file.b2ThumbSmallPath,
            );
            thumbSmallUrl = result.downloadUrl;
          } catch (error) {
            this.logger.warn(
              `Failed to get thumbnail URL for file ${file.id}:`,
              error,
            );
          }
        }

        return {
          fileId: file.id,
          fileNameEncrypted: file.fileNameEncrypted,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          blurhash: file.blurhash,
          width: file.width,
          height: file.height,
          duration: file.duration,
          isFavorite: file.isFavorite,
          cipherThumbSmallKey: file.cipherThumbSmallKey,
          thumbSmallUrl,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        };
      }),
    );

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
   * Remove a file from an album.
   * Does not delete the file itself, only the album association.
   * @param fileId - The file ID to remove
   * @param userId - The user ID for ownership verification
   * @param albumId - The album to remove the file from
   */
  async removeFileFromAlbum(fileId: string, userId: string, albumId: string) {
    // Verify file exists and user owns it
    await this.verifyFileOwnership(fileId, userId);

    const albumFile = await this.albumFilesRepository.findOne({
      where: { albumId, fileId },
    });

    if (!albumFile) {
      throw new NotFoundException('File not found in album');
    }

    await this.albumFilesRepository.remove(albumFile);

    return {
      success: true,
      message: 'File removed from album',
    };
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
   * Toggle favorite status for a file.
   */
  async toggleFavorite(fileId: string, userId: string) {
    const file = await this.verifyFileOwnership(fileId, userId);
    file.isFavorite = !file.isFavorite;
    await this.filesRepository.save(file);

    return {
      fileId: file.id,
      isFavorite: file.isFavorite,
    };
  }

  /**
   * List favorite files for a user.
   */
  async listFavorites(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ) {
    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const [files, total] = await this.filesRepository.findAndCount({
      where: { userId, isFavorite: true, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Get signed URLs for small thumbnails in parallel
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        let thumbSmallUrl: string | null = null;

        if (file.b2ThumbSmallPath) {
          try {
            const result = await this.b2StorageService.getSignedDownloadUrl(
              file.b2ThumbSmallPath,
            );
            thumbSmallUrl = result.downloadUrl;
          } catch (error) {
            this.logger.warn(
              `Failed to get thumbnail URL for file ${file.id}:`,
              error,
            );
          }
        }

        return {
          fileId: file.id,
          fileNameEncrypted: file.fileNameEncrypted,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          blurhash: file.blurhash,
          width: file.width,
          height: file.height,
          duration: file.duration,
          isFavorite: file.isFavorite,
          cipherThumbSmallKey: file.cipherThumbSmallKey,
          thumbSmallUrl,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        };
      }),
    );

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
   * Delete a file permanently from B2 storage and database.
   * Also removes all album associations.
   */
  async deleteFile(fileId: string, userId: string) {
    const file = await this.filesRepository.findOne({
      where: { id: fileId, userId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Delete from B2 storage (main file + thumbnails in parallel)
    try {
      await this.b2StorageService.deleteFiles([
        file.b2FilePath,
        file.b2ThumbSmallPath,
        file.b2ThumbMediumPath,
      ]);
    } catch (error) {
      this.logger.error(`Failed to delete file from B2: ${file.id}`, error);
      // Continue with database deletion even if B2 fails
    }

    // Remove from all albums
    await this.albumFilesRepository.delete({ fileId });

    // Permanently delete from database
    await this.filesRepository.remove(file);

    return { success: true, message: 'File permanently deleted' };
  }

  /**
   * Get storage usage for a user.
   * Returns current usage, limit, and whether exceeded.
   */
  async getStorageUsage(userId: string) {
    // Get total bytes used by user (excluding soft-deleted files)
    const result = await this.filesRepository
      .createQueryBuilder('file')
      .select('COALESCE(SUM(file.sizeBytes), 0)', 'totalBytes')
      .where('file.userId = :userId', { userId })
      .andWhere('file.deletedAt IS NULL')
      .getRawOne();

    const usedBytes = parseInt(result.totalBytes, 10) || 0;
    const limitGb = this.configService.get<number>('storage.limitGb', 1);
    const limitBytes = limitGb * 1024 * 1024 * 1024; // Convert GB to bytes
    const usedGb = usedBytes / (1024 * 1024 * 1024);

    return {
      usedBytes,
      usedGb: Math.round(usedGb * 100) / 100, // Round to 2 decimal places
      limitBytes,
      limitGb,
      exceeded: usedBytes >= limitBytes,
      percentUsed: Math.min(Math.round((usedBytes / limitBytes) * 100), 100),
    };
  }
}
