import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Album } from '../../database/entities/album.entity';
import { AlbumFile } from '../../database/entities/album-file.entity';
import { FilesService } from '../files/files.service';
import { B2StorageService } from '../storage/b2-storage.service';
import { CacheService } from '../cache/cache.service';
import { CreateAlbumDto } from './dto/create-album.dto';
import { AddFilesToAlbumDto } from './dto/add-files-to-album.dto';

@Injectable()
export class AlbumsService {
  private readonly logger = new Logger(AlbumsService.name);

  constructor(
    @InjectRepository(Album)
    private albumsRepository: Repository<Album>,
    @InjectRepository(AlbumFile)
    private albumFilesRepository: Repository<AlbumFile>,
    private filesService: FilesService,
    private b2StorageService: B2StorageService,
    private cacheService: CacheService,
  ) {}

  /**
   * Create a new album.
   */
  async createAlbum(userId: string, dto: CreateAlbumDto) {
    const album = this.albumsRepository.create({
      userId,
      titleEncrypted: dto.titleEncrypted,
    });

    await this.albumsRepository.save(album);

    await this.cacheService.incrementVersion(userId, 'albums');

    return {
      albumId: album.id,
      titleEncrypted: album.titleEncrypted,
      createdAt: album.createdAt,
    };
  }

  /**
   * Get album details.
   */
  async getAlbum(albumId: string, userId: string) {
    const album = await this.albumsRepository.findOne({
      where: { id: albumId },
    });

    if (!album) {
      throw new NotFoundException('Album not found');
    }

    // Verify ownership
    if (album.userId !== userId) {
      // TODO: Check for shared access in future implementation
      throw new ForbiddenException('Access denied');
    }

    // Count files in album
    const fileCount = await this.albumFilesRepository.count({
      where: { albumId },
    });

    return {
      albumId: album.id,
      titleEncrypted: album.titleEncrypted,
      fileCount,
      createdAt: album.createdAt,
    };
  }

  /**
   * List all albums for a user.
   */
  async listAlbums(userId: string) {
    const albumsVer = await this.cacheService.getVersion(userId, 'albums');
    const cacheKey = `list:av:${albumsVer}`;
    
    const cached = await this.cacheService.get<any>(userId, 'albums', cacheKey);
    if (cached) {
      return cached;
    }

    const albums = await this.albumsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    // Get file counts for each album
    const albumIds = albums.map((a) => a.id);
    const fileCounts = await this.getFileCountsForAlbums(albumIds);

    const result = {
      albums: albums.map((album) => ({
        albumId: album.id,
        titleEncrypted: album.titleEncrypted,
        fileCount: fileCounts[album.id] || 0,
        createdAt: album.createdAt,
      })),
    };

    await this.cacheService.set(userId, 'albums', cacheKey, result);
    return result;
  }

  /**
   * Add files to an album.
   */
  async addFilesToAlbum(
    albumId: string,
    userId: string,
    dto: AddFilesToAlbumDto,
  ) {
    // Verify album ownership
    const album = await this.verifyAlbumOwnership(albumId, userId);

    // Verify all files belong to the user
    const files = await this.filesService.getFilesByIds(dto.fileIds, userId);

    if (files.length !== dto.fileIds.length) {
      throw new BadRequestException(
        'One or more files not found or not accessible',
      );
    }

    // Get the current max order index
    const maxOrderResult = await this.albumFilesRepository
      .createQueryBuilder('af')
      .select('MAX(af.orderIndex)', 'maxOrder')
      .where('af.albumId = :albumId', { albumId })
      .getRawOne();

    let orderIndex = (maxOrderResult?.maxOrder ?? -1) + 1;

    // Add files to album (ignore duplicates)
    const albumFiles: AlbumFile[] = [];
    for (const fileId of dto.fileIds) {
      const existing = await this.albumFilesRepository.findOne({
        where: { albumId, fileId },
      });

      if (!existing) {
        const albumFile = this.albumFilesRepository.create({
          albumId,
          fileId,
          orderIndex: orderIndex++,
        });
        albumFiles.push(albumFile);
      }
    }

    if (albumFiles.length > 0) {
      await this.albumFilesRepository.save(albumFiles);
      await this.cacheService.incrementVersion(userId, 'albums');
    }

    return {
      success: true,
      addedCount: albumFiles.length,
      message: `Added ${albumFiles.length} files to album`,
    };
  }

  /**
   * List files in an album.
   */
  async listAlbumFiles(
    albumId: string,
    userId: string,
    options: { page?: number; limit?: number } = {},
  ) {
    // Verify album ownership
    await this.verifyAlbumOwnership(albumId, userId);

    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const [albumFiles, total] = await this.albumFilesRepository.findAndCount({
      where: { albumId },
      relations: ['file'],
      order: { orderIndex: 'ASC' },
      skip,
      take: limit,
    });

    // Filter out deleted files
    const validAlbumFiles = albumFiles.filter(
      (af) => af.file && !af.file.deletedAt,
    );

    // PERFORMANCE: Batch all signed URL requests to avoid N+1 queries
    // Collect all thumbnail paths first
    const thumbnailPaths = validAlbumFiles
      .filter(af => af.file.b2ThumbSmallPath)
      .map(af => af.file.b2ThumbSmallPath!);

    // Fetch all signed URLs in parallel (single batch)
    const signedUrlPromises = thumbnailPaths.map(path =>
      this.b2StorageService.getSignedDownloadUrl(path)
        .then(result => ({ path, url: result.downloadUrl }))
        .catch(error => {
          this.logger.warn(`Failed to get thumbnail URL for ${path}:`, error);
          return { path, url: null };
        })
    );

    const signedUrls = await Promise.all(signedUrlPromises);
    
    // Create lookup map for O(1) access
    const urlMap = new Map(signedUrls.map(item => [item.path, item.url]));

    // Map files with their signed URLs
    const filesWithUrls = validAlbumFiles.map((af) => ({
      fileId: af.file.id,
      fileNameEncrypted: af.file.fileNameEncrypted,
      mimeType: af.file.mimeType,
      sizeBytes: af.file.sizeBytes,
      width: af.file.width,
      height: af.file.height,
      duration: af.file.duration,
      isFavorite: af.file.isFavorite,
      thumbSmallUrl: af.file.b2ThumbSmallPath ? urlMap.get(af.file.b2ThumbSmallPath) || null : null,
      cipherFileKey: af.file.cipherFileKey,
      orderIndex: af.orderIndex,
      createdAt: af.file.createdAt,
      updatedAt: af.file.updatedAt,
    }));

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
   * Delete an album.
   * This only removes the album and album-file associations.
   * The actual files remain in the user's file storage.
   */
  async deleteAlbum(albumId: string, userId: string) {
    // Verify album ownership
    const album = await this.verifyAlbumOwnership(albumId, userId);

    // Delete album (cascade will remove album_files entries)
    await this.albumsRepository.remove(album);

    await this.cacheService.incrementVersion(userId, 'albums');

    return {
      success: true,
      message: 'Album deleted',
    };
  }

  /**
   * Verify that an album belongs to the user.
   */
  private async verifyAlbumOwnership(
    albumId: string,
    userId: string,
  ): Promise<Album> {
    const album = await this.albumsRepository.findOne({
      where: { id: albumId },
    });

    if (!album) {
      throw new NotFoundException('Album not found');
    }

    if (album.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return album;
  }

  /**
   * Get file counts for multiple albums.
   */
  private async getFileCountsForAlbums(
    albumIds: string[],
  ): Promise<Record<string, number>> {
    if (albumIds.length === 0) return {};

    const counts = await this.albumFilesRepository
      .createQueryBuilder('af')
      .select('af.albumId', 'albumId')
      .addSelect('COUNT(*)', 'count')
      .where('af.albumId IN (:...albumIds)', { albumIds })
      .groupBy('af.albumId')
      .getRawMany();

    const result: Record<string, number> = {};
    for (const row of counts) {
      result[row.albumId] = parseInt(row.count, 10);
    }
    return result;
  }
}
