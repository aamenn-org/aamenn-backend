import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ShareLink, ShareItem, ShareItemType } from '../../database/entities/share-link.entity';
import { File } from '../../database/entities/file.entity';
import { Folder } from '../../database/entities/folder.entity';
import { B2StorageService } from '../storage/b2-storage.service';
import { CreateShareDto } from './dto/create-share.dto';
import {
  ShareLinkDto,
  SharedFileItem,
  SharedFolderItem,
  SharedRootItem,
  ResolveShareResponseDto,
  BrowseShareFolderResponseDto,
} from './dto/share-response.dto';

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

  async createShare(
    userId: string,
    dto: CreateShareDto,
    frontendBaseUrl: string,
  ): Promise<ShareLinkDto> {
    for (const item of dto.items) {
      await this.verifyOwnership(userId, item.type, item.id);
    }

    const slug = await this.generateUniqueSlug(dto.slugBase);
    const expiresAt = dto.expiresInSeconds
      ? new Date(Date.now() + dto.expiresInSeconds * 1000)
      : null;

    const metadata: Record<string, unknown> = {};
    if (dto.fileKeys) metadata.fileKeys = dto.fileKeys;
    if (dto.fileNames) metadata.fileNames = dto.fileNames;

    const shareLink = this.shareLinkRepository.create({
      slug,
      ownerUserId: userId,
      items: dto.items,
      shareKey: dto.shareKey,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      expiresAt,
    });

    await this.shareLinkRepository.save(shareLink);
    return this.toShareLinkDto(shareLink, frontendBaseUrl);
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
      shares: shares.map((s) => this.toShareLinkDto(s, frontendBaseUrl)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async revokeShare(shareId: string, userId: string) {
    const share = await this.shareLinkRepository.findOne({ where: { id: shareId } });
    if (!share) throw new NotFoundException('Share link not found');
    if (share.ownerUserId !== userId) throw new ForbiddenException('Access denied');

    share.revokedAt = new Date();
    await this.shareLinkRepository.save(share);
    return { success: true, message: 'Share link revoked' };
  }

  async resolveShare(slug: string): Promise<ResolveShareResponseDto> {
    const share = await this.findActiveShare(slug);
    const fileKeys = (share.metadata?.fileKeys as Record<string, string>) ?? {};
    const fileNames = (share.metadata?.fileNames as Record<string, string>) ?? {};

    const items = await Promise.all(
      share.items.map((item) => this.resolveRootItem(item)),
    );

    return {
      shareKey: share.shareKey,
      fileKeys,
      fileNames,
      items: items.filter((i): i is SharedRootItem => i !== null),
    };
  }

  async browseShareFolder(
    slug: string,
    folderId: string,
  ): Promise<BrowseShareFolderResponseDto> {
    const share = await this.findActiveShare(slug);

    const accessible = await this.isFolderAccessibleInShare(share, folderId);
    if (!accessible) throw new ForbiddenException('Folder not accessible via this share');

    const folder = await this.foldersRepository.findOne({
      where: { id: folderId, deletedAt: IsNull() },
    });
    if (!folder) throw new NotFoundException('Folder not found');

    const childFolders = await this.foldersRepository.find({
      where: { parentFolderId: folderId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    const files = await this.fileRepository.find({
      where: { folderId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    const folderItems: SharedFolderItem[] = childFolders.map((f) => ({
      type: 'folder',
      folderId: f.id,
      nameEncrypted: f.nameEncrypted,
    }));

    const fileItems: SharedFileItem[] = await Promise.all(
      files.map((f) => this.buildFileItem(f)),
    );

    return {
      folderId,
      nameEncrypted: folder.nameEncrypted,
      items: [...folderItems, ...fileItems],
    };
  }

  async saveToAccount(
    slug: string,
    userId: string,
    files: { originalFileId: string; cipherFileKey: string; fileNameEncrypted: string }[],
  ): Promise<{ success: boolean; savedCount: number }> {
    const share = await this.findActiveShare(slug);
    const fileKeys = (share.metadata?.fileKeys as Record<string, string>) ?? {};

    // Validate all requested files exist and belong to this share
    let savedCount = 0;
    for (const item of files) {
      // The file must have an entry in the share's fileKeys
      if (!fileKeys[item.originalFileId]) {
        this.logger.warn(
          `saveToAccount: fileId ${item.originalFileId} not in share fileKeys — skipping`,
        );
        continue;
      }

      const originalFile = await this.fileRepository.findOne({
        where: { id: item.originalFileId, deletedAt: IsNull() },
      });
      if (!originalFile) continue;

      // Check if user already has a copy of this exact B2 file
      const existing = await this.fileRepository.findOne({
        where: { userId, b2FilePath: originalFile.b2FilePath, deletedAt: IsNull() },
      });
      if (existing) {
        savedCount++;
        continue; // Already saved
      }

      // Create a new File record for the saving user, pointing to the same B2 objects
      const newFile = this.fileRepository.create({
        userId,
        fileNameEncrypted: item.fileNameEncrypted,
        cipherFileKey: item.cipherFileKey,
        mimeType: originalFile.mimeType,
        sizeBytes: originalFile.sizeBytes,
        width: originalFile.width,
        height: originalFile.height,
        duration: originalFile.duration,
        b2FilePath: originalFile.b2FilePath,
        b2ThumbSmallPath: originalFile.b2ThumbSmallPath,
        b2ThumbMediumPath: originalFile.b2ThumbMediumPath,
        b2ThumbLargePath: originalFile.b2ThumbLargePath,
        contentHash: originalFile.contentHash,
        folderId: null, // Save to root
      });

      await this.fileRepository.save(newFile);
      savedCount++;
    }

    return { success: true, savedCount };
  }

  private async findActiveShare(slug: string): Promise<ShareLink> {
    const share = await this.shareLinkRepository.findOne({ where: { slug } });
    if (!share) throw new NotFoundException('Share link not found');
    if (share.revokedAt) throw new NotFoundException('Share link has been revoked');
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException('Share link has expired');
    }
    return share;
  }

  private async resolveRootItem(item: ShareItem): Promise<SharedRootItem | null> {
    if (item.type === 'file') {
      const file = await this.fileRepository.findOne({
        where: { id: item.id, deletedAt: IsNull() },
      });
      if (!file) return null;
      return this.buildFileItem(file);
    }

    const folder = await this.foldersRepository.findOne({
      where: { id: item.id, deletedAt: IsNull() },
    });
    if (!folder) return null;
    return { type: 'folder', folderId: folder.id, nameEncrypted: folder.nameEncrypted };
  }

  private async buildFileItem(file: File): Promise<SharedFileItem> {
    const [downloadResult, thumbSmall, thumbMedium, thumbLarge] = await Promise.all([
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
      type: 'file',
      fileId: file.id,
      cipherFileKey: file.cipherFileKey,
      fileNameEncrypted: file.fileNameEncrypted,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      duration: file.duration,
      downloadUrl: downloadResult.downloadUrl,
      thumbSmallUrl: thumbSmall?.downloadUrl ?? null,
      thumbMediumUrl: thumbMedium?.downloadUrl ?? null,
      thumbLargeUrl: thumbLarge?.downloadUrl ?? null,
      createdAt: file.createdAt,
    };
  }

  private async isFolderAccessibleInShare(
    share: ShareLink,
    folderId: string,
  ): Promise<boolean> {
    for (const item of share.items) {
      if (item.type === 'folder') {
        if (item.id === folderId) return true;
        const isDescendant = await this.isFolderDescendantOf(folderId, item.id);
        if (isDescendant) return true;
      }
    }
    return false;
  }

  private async isFolderDescendantOf(
    folderId: string,
    ancestorId: string,
  ): Promise<boolean> {
    const visited = new Set<string>();
    let current = folderId;

    while (current) {
      if (visited.has(current)) return false;
      if (current === ancestorId) return true;
      visited.add(current);

      const folder = await this.foldersRepository.findOne({
        where: { id: current },
        select: ['id', 'parentFolderId'],
      });
      if (!folder?.parentFolderId) return false;
      current = folder.parentFolderId;
    }

    return false;
  }

  private async verifyOwnership(
    userId: string,
    type: ShareItemType,
    id: string,
  ): Promise<void> {
    if (type === 'file') {
      const file = await this.fileRepository.findOne({
        where: { id, deletedAt: IsNull() },
      });
      if (!file) throw new NotFoundException('File not found');
      if (file.userId !== userId) throw new ForbiddenException('Access denied');
    } else {
      const folder = await this.foldersRepository.findOne({
        where: { id, deletedAt: IsNull() },
      });
      if (!folder) throw new NotFoundException('Folder not found');
      if (folder.userId !== userId) throw new ForbiddenException('Access denied');
    }
  }

  private async generateUniqueSlug(baseSlug: string): Promise<string> {
    const normalizedSlug = baseSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      || 'shared';

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
      items: share.items,
      expiresAt: share.expiresAt,
      revokedAt: share.revokedAt,
      status,
      createdAt: share.createdAt,
    };
  }

  private getShareStatus(share: ShareLink): 'active' | 'expired' | 'revoked' {
    if (share.revokedAt) return 'revoked';
    if (share.expiresAt && share.expiresAt < new Date()) return 'expired';
    return 'active';
  }
}
