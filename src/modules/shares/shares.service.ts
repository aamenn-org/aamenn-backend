import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { ShareLink, ShareResourceType } from '../../database/entities/share-link.entity';
import { File } from '../../database/entities/file.entity';
import { Folder } from '../../database/entities/folder.entity';
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
    @InjectRepository(Folder)
    private foldersRepository: Repository<Folder>,
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
        metadata: item.fileKeys ? { fileKeys: item.fileKeys } : null,
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
      metadata: share.metadata,
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

  async resolveFolderShare(resourceId: string) {
    const folder = await this.foldersRepository.findOne({
      where: { id: resourceId, deletedAt: IsNull() },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found or has been deleted');
    }

    // Get all files in folder and subfolders recursively
    const descendantIds = await this.collectDescendantFolderIds(resourceId, folder.userId);
    const allFolderIds = [resourceId, ...descendantIds];

    const files = await this.fileRepository.find({
      where: {
        userId: folder.userId,
        folderId: In(allFolderIds),
        deletedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    // Generate signed URLs for all files
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        const [downloadResult, thumbSmallResult] = await Promise.all([
          this.b2StorageService.getSignedDownloadUrl(file.b2FilePath),
          file.b2ThumbSmallPath
            ? this.b2StorageService.getSignedDownloadUrl(file.b2ThumbSmallPath)
            : Promise.resolve(null),
        ]);

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
          thumbSmallUrl: thumbSmallResult?.downloadUrl || null,
          createdAt: file.createdAt,
        };
      }),
    );

    return {
      folderId: folder.id,
      nameEncrypted: folder.nameEncrypted,
      files: filesWithUrls,
      totalFiles: filesWithUrls.length,
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
    } else if (resourceType === ShareResourceType.FOLDER) {
      const folder = await this.foldersRepository.findOne({
        where: { id: resourceId, deletedAt: IsNull() },
      });

      if (!folder) {
        throw new NotFoundException('Folder not found');
      }

      if (folder.userId !== userId) {
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

  private async collectDescendantFolderIds(
    folderId: string,
    userId: string,
  ): Promise<string[]> {
    const result: string[] = [];
    const queue: string[] = [folderId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = await this.foldersRepository.find({
        where: { userId, parentFolderId: currentId, deletedAt: IsNull() },
      });

      for (const child of children) {
        result.push(child.id);
        queue.push(child.id);
      }
    }

    return result;
  }
}
