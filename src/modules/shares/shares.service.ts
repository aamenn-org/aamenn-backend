import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ShareLink, ShareResourceType } from '../../database/entities/share-link.entity';
import { File } from '../../database/entities/file.entity';
import { Album } from '../../database/entities/album.entity';
import { AlbumFile } from '../../database/entities/album-file.entity';
import { B2StorageService } from '../storage/b2-storage.service';
import { CreateShareItemDto } from './dto/create-share.dto';
import { ShareLinkDto } from './dto/share-response.dto';

@Injectable()
export class SharesService {
  private readonly logger = new Logger(SharesService.name);

  constructor(
    @InjectRepository(ShareLink)
    private shareLinkRepository: Repository<ShareLink>,
    @InjectRepository(File)
    private fileRepository: Repository<File>,
    @InjectRepository(Album)
    private albumRepository: Repository<Album>,
    @InjectRepository(AlbumFile)
    private albumFileRepository: Repository<AlbumFile>,
    private b2StorageService: B2StorageService,
  ) {}

  async createShares(
    userId: string,
    items: CreateShareItemDto[],
    frontendBaseUrl: string,
  ): Promise<ShareLinkDto[]> {
    const createdShares: ShareLinkDto[] = [];

    for (const item of items) {
      await this.verifyOwnership(userId, item.type, item.id);

      const slug = await this.generateUniqueSlug(item.slugBase);

      const expiresAt = item.expiresInSeconds
        ? new Date(Date.now() + item.expiresInSeconds * 1000)
        : null;

      const shareLink = this.shareLinkRepository.create({
        slug,
        ownerUserId: userId,
        resourceType: item.type,
        resourceId: item.id,
        shareKey: item.shareKey,
        expiresAt,
      });

      await this.shareLinkRepository.save(shareLink);

      createdShares.push(this.toShareLinkDto(shareLink, frontendBaseUrl));
    }

    return createdShares;
  }

  async listShares(
    userId: string,
    page: number,
    limit: number,
    frontendBaseUrl: string,
  ) {
    const skip = (page - 1) * limit;

    const [shares, total] = await this.shareLinkRepository.findAndCount({
      where: { ownerUserId: userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      shares: shares.map((share) => this.toShareLinkDto(share, frontendBaseUrl)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async revokeShare(shareId: string, userId: string) {
    const share = await this.shareLinkRepository.findOne({
      where: { id: shareId },
    });

    if (!share) {
      throw new NotFoundException('Share link not found');
    }

    if (share.ownerUserId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    share.revokedAt = new Date();
    await this.shareLinkRepository.save(share);

    return { success: true, message: 'Share link revoked' };
  }

  async resolveShare(slug: string) {
    const share = await this.shareLinkRepository.findOne({
      where: { slug },
    });

    if (!share) {
      throw new NotFoundException('Share link not found');
    }

    if (share.revokedAt) {
      throw new NotFoundException('Share link has been revoked');
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException('Share link has expired');
    }

    return {
      resourceType: share.resourceType,
      resourceId: share.resourceId,
      shareKey: share.shareKey,
    };
  }

  async resolveFileShare(resourceId: string) {
    const file = await this.fileRepository.findOne({
      where: { id: resourceId, deletedAt: IsNull() },
    });

    if (!file) {
      throw new NotFoundException('File not found or has been deleted');
    }

    const [downloadResult, thumbSmallResult, thumbMediumResult, thumbLargeResult] =
      await Promise.all([
        this.b2StorageService.getSignedDownloadUrl(file.b2FilePath),
        file.b2ThumbSmallPath
          ? this.b2StorageService.getSignedDownloadUrl(file.b2ThumbSmallPath)
          : Promise.resolve(null),
        file.b2ThumbMediumPath
          ? this.b2StorageService.getSignedDownloadUrl(file.b2ThumbMediumPath)
          : Promise.resolve(null),
        file.b2ThumbLargePath
          ? this.b2StorageService.getSignedDownloadUrl(file.b2ThumbLargePath)
          : Promise.resolve(null),
      ]);

    return {
      fileId: file.id,
      cipherFileKey: file.cipherFileKey, // Keep for compatibility
      fileNameEncrypted: file.fileNameEncrypted,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      duration: file.duration,
      downloadUrl: downloadResult.downloadUrl,
      thumbSmallUrl: thumbSmallResult?.downloadUrl || null,
      thumbMediumUrl: thumbMediumResult?.downloadUrl || null,
      thumbLargeUrl: thumbLargeResult?.downloadUrl || null,
      createdAt: file.createdAt,
    };
  }

  async resolveAlbumShare(
    resourceId: string,
    page: number,
    limit: number,
  ) {
    const album = await this.albumRepository.findOne({
      where: { id: resourceId },
    });

    if (!album) {
      throw new NotFoundException('Album not found');
    }

    const skip = (page - 1) * limit;

    const [albumFiles, total] = await this.albumFileRepository.findAndCount({
      where: { albumId: resourceId },
      relations: ['file'],
      order: { orderIndex: 'ASC' },
      skip,
      take: limit,
    });

    const validAlbumFiles = albumFiles.filter(
      (af) => af.file && !af.file.deletedAt,
    );

    const thumbnailPaths = validAlbumFiles
      .filter((af) => af.file.b2ThumbSmallPath)
      .map((af) => af.file.b2ThumbSmallPath!);

    const signedUrlPromises = thumbnailPaths.map((path) =>
      this.b2StorageService
        .getSignedDownloadUrl(path)
        .then((result) => ({ path, url: result.downloadUrl }))
        .catch((error) => {
          this.logger.warn(`Failed to get thumbnail URL for ${path}:`, error);
          return { path, url: null };
        }),
    );

    const signedUrls = await Promise.all(signedUrlPromises);
    const urlMap = new Map(signedUrls.map((item) => [item.path, item.url]));

    const filesWithUrls = validAlbumFiles.map((af) => ({
      fileId: af.file.id,
      fileNameEncrypted: af.file.fileNameEncrypted,
      mimeType: af.file.mimeType,
      sizeBytes: af.file.sizeBytes,
      width: af.file.width,
      height: af.file.height,
      duration: af.file.duration,
      thumbSmallUrl: af.file.b2ThumbSmallPath
        ? urlMap.get(af.file.b2ThumbSmallPath) || null
        : null,
      orderIndex: af.orderIndex,
      createdAt: af.file.createdAt,
    }));

    return {
      albumId: album.id,
      titleEncrypted: album.titleEncrypted,
      files: filesWithUrls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async verifyOwnership(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<void> {
    if (resourceType === ShareResourceType.FILE) {
      const file = await this.fileRepository.findOne({
        where: { id: resourceId, deletedAt: IsNull() },
      });

      if (!file) {
        throw new NotFoundException('File not found');
      }

      if (file.userId !== userId) {
        throw new ForbiddenException('Access denied');
      }
    } else if (resourceType === ShareResourceType.ALBUM) {
      const album = await this.albumRepository.findOne({
        where: { id: resourceId },
      });

      if (!album) {
        throw new NotFoundException('Album not found');
      }

      if (album.userId !== userId) {
        throw new ForbiddenException('Access denied');
      }
    }
  }

  private async generateUniqueSlug(baseSlug: string): Promise<string> {
    const normalizedSlug = baseSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    let slug = normalizedSlug;
    let counter = 2;

    while (await this.shareLinkRepository.findOne({ where: { slug } })) {
      slug = `${normalizedSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  private toShareLinkDto(share: ShareLink, frontendBaseUrl: string): ShareLinkDto {
    const status = this.getShareStatus(share);
    const url = `${frontendBaseUrl}/share/${share.slug}#k=${encodeURIComponent(share.shareKey)}`;

    return {
      id: share.id,
      slug: share.slug,
      url,
      resourceType: share.resourceType,
      resourceId: share.resourceId,
      expiresAt: share.expiresAt,
      revokedAt: share.revokedAt,
      status,
      createdAt: share.createdAt,
    };
  }

  private getShareStatus(
    share: ShareLink,
  ): 'active' | 'expired' | 'revoked' {
    if (share.revokedAt) {
      return 'revoked';
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return 'expired';
    }

    return 'active';
  }
}
