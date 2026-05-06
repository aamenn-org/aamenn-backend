import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UploadsService } from './uploads.service';

@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);

  private static readonly STALE_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private readonly uploadsService: UploadsService) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupStaleUploads(): Promise<void> {
    this.logger.log('Running stale upload session cleanup...');

    try {
      const count = await this.uploadsService.expireStaleSessions(
        UploadCleanupService.STALE_SESSION_MAX_AGE_MS,
      );

      if (count > 0) {
        this.logger.log(`Expired ${count} stale upload session(s)`);
      } else {
        this.logger.log('No stale upload sessions found');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Upload cleanup failed: ${msg}`);
    }
  }
}
