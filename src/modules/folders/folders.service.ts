import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { Folder } from '../../database/entities/folder.entity';
import { File } from '../../database/entities/file.entity';
import { B2StorageService } from '../storage/b2-storage.service';
import { CacheService } from '../cache/cache.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);

  constructor(
    @InjectRepository(Folder)
    private foldersRepository: Repository<Folder>,
    @InjectRepository(File)
    private filesRepository: Repository<File>,
    private b2StorageService: B2StorageService,
    private cacheService: CacheService,
  ) {}

  /**
   * Create a new folder.
   * Folder name is encrypted client-side — backend NEVER sees plaintext.
   */
  async createFolder(userId: string, dto: CreateFolderDto) {
    // Verify parent folder exists and belongs to user (if provided)
    if (dto.parentFolderId) {
      await this.verifyFolderOwnership(dto.parentFolderId, userId);
    }

    const folder = this.foldersRepository.create({
      userId,
      nameEncrypted: dto.nameEncrypted,
      parentFolderId: dto.parentFolderId || null,
    });

    await this.foldersRepository.save(folder);
    await this.cacheService.incrementVersion(userId, 'files');

    return {
      folderId: folder.id,
      nameEncrypted: folder.nameEncrypted,
      parentFolderId: folder.parentFolderId,
      createdAt: folder.createdAt,
    };
  }

  /**
   * Get folder metadata.
   */
  async getFolder(folderId: string, userId: string) {
    const folder = await this.verifyFolderOwnership(folderId, userId);

    const [fileCount, subfolderCount] = await Promise.all([
      this.filesRepository.count({
        where: { userId, folderId, deletedAt: IsNull() },
      }),
      this.foldersRepository.count({
        where: { userId, parentFolderId: folderId, deletedAt: IsNull() },
      }),
    ]);

    return {
      folderId: folder.id,
      nameEncrypted: folder.nameEncrypted,
      parentFolderId: folder.parentFolderId,
      fileCount,
      subfolderCount,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  }

  /**
   * List folders at a given level (root or under a parent).
   */
  async listFolders(
    userId: string,
    parentFolderId: string | null = null,
  ) {
    const where: any = {
      userId,
      deletedAt: IsNull(),
    };

    if (parentFolderId) {
      where.parentFolderId = parentFolderId;
    } else {
      where.parentFolderId = IsNull();
    }

    const folders = await this.foldersRepository.find({
      where,
      order: { createdAt: 'ASC' },
    });

    // Get counts for each folder
    const folderIds = folders.map((f) => f.id);
    const [fileCounts, subfolderCounts] = await Promise.all([
      this.getFileCountsForFolders(folderIds, userId),
      this.getSubfolderCountsForFolders(folderIds, userId),
    ]);

    return {
      folders: folders.map((folder) => ({
        folderId: folder.id,
        nameEncrypted: folder.nameEncrypted,
        parentFolderId: folder.parentFolderId,
        fileCount: fileCounts[folder.id] || 0,
        subfolderCount: subfolderCounts[folder.id] || 0,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      })),
    };
  }

  /**
   * Update folder (rename or move).
   * Name is encrypted client-side — backend NEVER sees plaintext.
   */
  async updateFolder(
    folderId: string,
    userId: string,
    dto: UpdateFolderDto,
  ) {
    const folder = await this.verifyFolderOwnership(folderId, userId);

    if (dto.nameEncrypted !== undefined) {
      folder.nameEncrypted = dto.nameEncrypted;
    }

    if (dto.parentFolderId !== undefined) {
      // Moving folder
      if (dto.parentFolderId === folderId) {
        throw new BadRequestException('Cannot move a folder into itself');
      }

      if (dto.parentFolderId) {
        // Verify target parent exists and belongs to user
        await this.verifyFolderOwnership(dto.parentFolderId, userId);

        // Prevent circular references: ensure target is not a descendant
        const isDescendant = await this.isFolderDescendant(
          dto.parentFolderId,
          folderId,
          userId,
        );
        if (isDescendant) {
          throw new BadRequestException(
            'Cannot move a folder into one of its own subfolders',
          );
        }
      }

      folder.parentFolderId = dto.parentFolderId || null;
    }

    await this.foldersRepository.save(folder);
    await this.cacheService.incrementVersion(userId, 'files');

    return {
      folderId: folder.id,
      nameEncrypted: folder.nameEncrypted,
      parentFolderId: folder.parentFolderId,
      updatedAt: folder.updatedAt,
    };
  }

  /**
   * Delete folder — recursively trash the entire subtree.
   */
  async deleteFolder(folderId: string, userId: string) {
    await this.verifyFolderOwnership(folderId, userId);

    // Collect all descendant folder IDs (recursive)
    const allFolderIds = await this.collectDescendantFolderIds(folderId, userId);
    allFolderIds.push(folderId);

    // Soft-delete all folders in subtree
    await this.foldersRepository
      .createQueryBuilder()
      .update(Folder)
      .set({ deletedAt: new Date() })
      .where('id IN (:...ids)', { ids: allFolderIds })
      .andWhere('user_id = :userId', { userId })
      .execute();

    // Soft-delete all files in those folders
    await this.filesRepository
      .createQueryBuilder()
      .update(File)
      .set({ deletedAt: new Date() })
      .where('folder_id IN (:...folderIds)', { folderIds: allFolderIds })
      .andWhere('user_id = :userId', { userId })
      .andWhere('deleted_at IS NULL')
      .execute();

    await this.cacheService.incrementVersion(userId, 'files');

    return {
      success: true,
      message: `Folder and ${allFolderIds.length} subfolders moved to trash`,
    };
  }

  /**
   * Restore folder — recursively restore the entire subtree.
   */
  async restoreFolder(folderId: string, userId: string) {
    const folder = await this.foldersRepository.findOne({
      where: { id: folderId, userId },
      withDeleted: true,
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    if (folder.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Collect all descendant folder IDs (including soft-deleted)
    const allFolderIds = await this.collectDescendantFolderIds(
      folderId,
      userId,
      true,
    );
    allFolderIds.push(folderId);

    // Check if parent folder still exists (not deleted)
    if (folder.parentFolderId) {
      const parent = await this.foldersRepository.findOne({
        where: { id: folder.parentFolderId, userId, deletedAt: IsNull() },
      });
      if (!parent) {
        // Parent was deleted or doesn't exist — restore to root
        folder.parentFolderId = null;
        await this.foldersRepository.save(folder);
      }
    }

    // Restore all folders in subtree
    await this.foldersRepository
      .createQueryBuilder()
      .update(Folder)
      .set({ deletedAt: null })
      .where('id IN (:...ids)', { ids: allFolderIds })
      .andWhere('user_id = :userId', { userId })
      .execute();

    // Restore all files in those folders
    await this.filesRepository
      .createQueryBuilder()
      .update(File)
      .set({ deletedAt: null })
      .where('folder_id IN (:...folderIds)', { folderIds: allFolderIds })
      .andWhere('user_id = :userId', { userId })
      .execute();

    await this.cacheService.incrementVersion(userId, 'files');

    return {
      success: true,
      message: 'Folder and contents restored',
    };
  }

  /**
   * Permanently delete folder and all contents from B2 + database.
   */
  async deleteFolderPermanently(folderId: string, userId: string) {
    const folder = await this.foldersRepository.findOne({
      where: { id: folderId, userId },
      withDeleted: true,
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    if (folder.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Collect all descendant folder IDs
    const allFolderIds = await this.collectDescendantFolderIds(
      folderId,
      userId,
      true,
    );
    allFolderIds.push(folderId);

    // Get all files in the subtree
    const files = await this.filesRepository.find({
      where: {
        userId,
        folderId: In(allFolderIds),
      },
      withDeleted: true,
    });

    // Delete files from B2 storage
    for (const file of files) {
      try {
        await this.b2StorageService.deleteFiles([
          file.b2FilePath,
          file.b2ThumbSmallPath,
          file.b2ThumbMediumPath,
          file.b2ThumbLargePath,
        ]);
      } catch (error) {
        this.logger.warn(
          `Failed to delete file from B2: ${file.b2FilePath}`,
          error,
        );
      }
    }

    // Delete files from database
    if (files.length > 0) {
      const fileIds = files.map((f) => f.id);
      await this.filesRepository
        .createQueryBuilder()
        .delete()
        .where('id IN (:...ids)', { ids: fileIds })
        .execute();
    }

    // Delete folders from database
    // Delete children first (bottom up) to avoid FK issues
    for (const id of allFolderIds.reverse()) {
      await this.foldersRepository
        .createQueryBuilder()
        .delete()
        .where('id = :id', { id })
        .execute();
    }

    await this.cacheService.incrementVersion(userId, 'files');

    return {
      success: true,
      message: `Folder and ${files.length} files permanently deleted`,
    };
  }

  /**
   * Get breadcrumb trail from root to a given folder.
   * Returns array ordered from root → target.
   * All names are encrypted — client decrypts them.
   */
  async getBreadcrumbs(
    folderId: string,
    userId: string,
  ): Promise<{ folderId: string; nameEncrypted: string }[]> {
    const breadcrumbs: { folderId: string; nameEncrypted: string }[] = [];
    let currentId: string | null = folderId;

    // Walk up the tree (max 50 levels for safety)
    let depth = 0;
    while (currentId && depth < 50) {
      const folder = await this.foldersRepository.findOne({
        where: { id: currentId, userId, deletedAt: IsNull() },
      });

      if (!folder) break;

      breadcrumbs.unshift({
        folderId: folder.id,
        nameEncrypted: folder.nameEncrypted,
      });

      currentId = folder.parentFolderId;
      depth++;
    }

    return breadcrumbs;
  }

  /**
   * Unified library listing: returns current folder metadata, breadcrumbs,
   * child folders, and child files in one call.
   */
  async getLibrary(
    userId: string,
    folderId: string | null = null,
    options: { page?: number; limit?: number } = {},
  ) {
    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    // Verify folder ownership if specified
    let currentFolder = null;
    if (folderId) {
      const folder = await this.verifyFolderOwnership(folderId, userId);
      const [fileCount, subfolderCount] = await Promise.all([
        this.filesRepository.count({
          where: { userId, folderId, deletedAt: IsNull() },
        }),
        this.foldersRepository.count({
          where: { userId, parentFolderId: folderId, deletedAt: IsNull() },
        }),
      ]);
      currentFolder = {
        folderId: folder.id,
        nameEncrypted: folder.nameEncrypted,
        parentFolderId: folder.parentFolderId,
        fileCount,
        subfolderCount,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      };
    }

    // Get breadcrumbs
    const breadcrumbs = folderId
      ? await this.getBreadcrumbs(folderId, userId)
      : [];

    // Get child folders
    const folderWhere: any = {
      userId,
      deletedAt: IsNull(),
    };
    folderWhere.parentFolderId = folderId ? folderId : IsNull();

    const childFolders = await this.foldersRepository.find({
      where: folderWhere,
      order: { createdAt: 'ASC' },
    });

    const childFolderIds = childFolders.map((f) => f.id);
    const [fileCounts, subfolderCounts] = await Promise.all([
      this.getFileCountsForFolders(childFolderIds, userId),
      this.getSubfolderCountsForFolders(childFolderIds, userId),
    ]);

    const foldersResult = childFolders.map((folder) => ({
      folderId: folder.id,
      nameEncrypted: folder.nameEncrypted,
      parentFolderId: folder.parentFolderId,
      fileCount: fileCounts[folder.id] || 0,
      subfolderCount: subfolderCounts[folder.id] || 0,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    }));

    // Get child files (paginated)
    const fileWhere: any = {
      userId,
      deletedAt: IsNull(),
    };
    fileWhere.folderId = folderId ? folderId : IsNull();

    const [files, totalFiles] = await this.filesRepository.findAndCount({
      where: fileWhere,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Generate signed URLs for thumbnails
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        let thumbSmallUrl = null;
        if (file.b2ThumbSmallPath) {
          try {
            const result = await this.b2StorageService.getSignedDownloadUrl(
              file.b2ThumbSmallPath,
            );
            thumbSmallUrl = result.downloadUrl;
          } catch (error) {
            this.logger.warn(
              `Failed to get thumbnail URL for ${file.b2ThumbSmallPath}`,
            );
          }
        }

        return {
          fileId: file.id,
          fileNameEncrypted: file.fileNameEncrypted,
          cipherFileKey: file.cipherFileKey,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          width: file.width,
          height: file.height,
          duration: file.duration,
          folderId: file.folderId,
          isFavorite: file.isFavorite,
          thumbSmallUrl,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        };
      }),
    );

    return {
      currentFolder,
      breadcrumbs,
      folders: foldersResult,
      files: filesWithUrls,
      pagination: {
        page,
        limit,
        total: totalFiles,
        totalPages: Math.ceil(totalFiles / limit),
      },
    };
  }

  /**
   * Get all files in a folder and its subfolders recursively.
   * Used for folder sharing — returns file encryption metadata.
   * Zero-knowledge: returns cipherFileKey (encrypted) so client can generate share keys.
   */
  async getAllFilesInFolder(folderId: string, userId: string) {
    await this.verifyFolderOwnership(folderId, userId);

    const descendantIds = await this.collectDescendantFolderIds(folderId, userId);
    const allFolderIds = [folderId, ...descendantIds];

    const files = await this.filesRepository.find({
      where: { userId, folderId: In(allFolderIds), deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    return {
      files: files.map((file) => ({
        fileId: file.id,
        fileNameEncrypted: file.fileNameEncrypted,
        cipherFileKey: file.cipherFileKey,
        mimeType: file.mimeType,
      })),
      total: files.length,
    };
  }

  /**
   * Move files to a folder.
   */
  async moveFilesToFolder(
    fileIds: string[],
    targetFolderId: string | null,
    userId: string,
  ) {
    // Verify target folder if specified
    if (targetFolderId) {
      await this.verifyFolderOwnership(targetFolderId, userId);
    }

    // Verify all files belong to user
    const files = await this.filesRepository.find({
      where: { id: In(fileIds), userId, deletedAt: IsNull() },
    });

    if (files.length !== fileIds.length) {
      throw new BadRequestException(
        'One or more files not found or not accessible',
      );
    }

    // Move files
    await this.filesRepository
      .createQueryBuilder()
      .update(File)
      .set({ folderId: targetFolderId })
      .where('id IN (:...ids)', { ids: fileIds })
      .andWhere('user_id = :userId', { userId })
      .execute();

    await this.cacheService.incrementVersion(userId, 'files');

    return {
      success: true,
      movedCount: files.length,
      message: `Moved ${files.length} files`,
    };
  }

  /**
   * Move a folder to another parent folder.
   */
  async moveFolderToFolder(
    folderId: string,
    targetParentFolderId: string | null,
    userId: string,
  ) {
    return this.updateFolder(folderId, userId, {
      parentFolderId: targetParentFolderId,
    });
  }

  // ==================== HELPERS ====================

  private async verifyFolderOwnership(
    folderId: string,
    userId: string,
  ): Promise<Folder> {
    const folder = await this.foldersRepository.findOne({
      where: { id: folderId, deletedAt: IsNull() },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return folder;
  }

  /**
   * Check if targetId is a descendant of ancestorId.
   */
  private async isFolderDescendant(
    targetId: string,
    ancestorId: string,
    userId: string,
  ): Promise<boolean> {
    let currentId: string | null = targetId;
    let depth = 0;

    while (currentId && depth < 50) {
      if (currentId === ancestorId) return true;

      const folder = await this.foldersRepository.findOne({
        where: { id: currentId, userId },
      });

      if (!folder) break;
      currentId = folder.parentFolderId;
      depth++;
    }

    return false;
  }

  /**
   * Collect all descendant folder IDs recursively.
   */
  private async collectDescendantFolderIds(
    folderId: string,
    userId: string,
    includeDeleted = false,
  ): Promise<string[]> {
    const result: string[] = [];
    const queue: string[] = [folderId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const where: any = { userId, parentFolderId: currentId };
      
      const children = includeDeleted
        ? await this.foldersRepository.find({ where, withDeleted: true })
        : await this.foldersRepository.find({
            where: { ...where, deletedAt: IsNull() },
          });

      for (const child of children) {
        result.push(child.id);
        queue.push(child.id);
      }
    }

    return result;
  }

  private async getFileCountsForFolders(
    folderIds: string[],
    userId: string,
  ): Promise<Record<string, number>> {
    if (folderIds.length === 0) return {};

    const counts = await this.filesRepository
      .createQueryBuilder('f')
      .select('f.folder_id', 'folderId')
      .addSelect('COUNT(*)', 'count')
      .where('f.folder_id IN (:...folderIds)', { folderIds })
      .andWhere('f.user_id = :userId', { userId })
      .andWhere('f.deleted_at IS NULL')
      .groupBy('f.folder_id')
      .getRawMany();

    const result: Record<string, number> = {};
    for (const row of counts) {
      result[row.folderId] = parseInt(row.count, 10);
    }
    return result;
  }

  private async getSubfolderCountsForFolders(
    folderIds: string[],
    userId: string,
  ): Promise<Record<string, number>> {
    if (folderIds.length === 0) return {};

    const counts = await this.foldersRepository
      .createQueryBuilder('f')
      .select('f.parent_folder_id', 'parentFolderId')
      .addSelect('COUNT(*)', 'count')
      .where('f.parent_folder_id IN (:...folderIds)', { folderIds })
      .andWhere('f.user_id = :userId', { userId })
      .andWhere('f.deleted_at IS NULL')
      .groupBy('f.parent_folder_id')
      .getRawMany();

    const result: Record<string, number> = {};
    for (const row of counts) {
      result[row.parentFolderId] = parseInt(row.count, 10);
    }
    return result;
  }
}
