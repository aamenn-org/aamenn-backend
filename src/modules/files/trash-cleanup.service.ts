import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { File } from '../../database/entities/file.entity';
import { User } from '../../database/entities/user.entity';
import { Folder } from '../../database/entities/folder.entity';
import { B2StorageService } from '../storage/b2-storage.service';

@Injectable()
export class TrashCleanupService {
  private readonly logger = new Logger(TrashCleanupService.name);

  constructor(
    @InjectRepository(File)
    private filesRepository: Repository<File>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Folder)
    private foldersRepository: Repository<Folder>,
    private b2StorageService: B2StorageService,
  ) {}

  /**
   * Run daily at 3:00 AM to purge expired trashed files.
   * Files are purged based on each user's trash_retention_days setting.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredTrash() {
    this.logger.log('Starting trash cleanup job...');

    try {
      // Get all users with their retention settings
      const users = await this.usersRepository.find({
        select: ['id', 'trashRetentionDays'],
      });

      let totalPurged = 0;

      // Process each user's trash
      for (const user of users) {
        const purgedCount = await this.purgeUserExpiredTrash(
          user.id,
          user.trashRetentionDays,
        );
        totalPurged += purgedCount;
      }

      this.logger.log(
        `Trash cleanup completed. Purged ${totalPurged} files across ${users.length} users.`,
      );
    } catch (error) {
      this.logger.error('Trash cleanup job failed:', error);
    }
  }

  /**
   * Purge expired trashed files for a specific user.
   */
  private async purgeUserExpiredTrash(
    userId: string,
    retentionDays: number,
  ): Promise<number> {
    // Calculate expiration date
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - retentionDays);

    // Find expired trashed files
    const expiredFiles = await this.filesRepository.find({
      where: {
        userId,
        deletedAt: LessThan(expirationDate),
      },
      take: 500, // Process in batches to avoid overwhelming B2
    });

    if (expiredFiles.length === 0) {
      return 0;
    }

    this.logger.log(
      `Purging ${expiredFiles.length} expired files for user ${userId}`,
    );

    // Delete from B2 in parallel (with concurrency limit)
    const batchSize = 10;
    for (let i = 0; i < expiredFiles.length; i += batchSize) {
      const batch = expiredFiles.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (file) => {
          try {
            await this.b2StorageService.deleteFiles([
              file.b2FilePath,
              file.b2ThumbSmallPath,
              file.b2ThumbMediumPath,
              file.b2ThumbLargePath,
            ]);
          } catch (error) {
            this.logger.error(
              `Failed to delete file ${file.id} from B2:`,
              error,
            );
          }
        }),
      );
    }

    
    // Remove from database
    await this.filesRepository.remove(expiredFiles);

    return expiredFiles.length;
  }
}
