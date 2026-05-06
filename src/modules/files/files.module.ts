import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { TrashCleanupService } from './trash-cleanup.service';
import { File } from '../../database/entities/file.entity';
import { User } from '../../database/entities/user.entity';
import { DownloadLog } from '../../database/entities/download-log.entity';
import { Folder } from '../../database/entities/folder.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([File, User, DownloadLog, Folder]),
    StorageModule,
  ],
  controllers: [FilesController],
  providers: [FilesService, TrashCleanupService],
  exports: [FilesService],
})
export class FilesModule {
  // CRITICAL: ThumbnailService removed to ensure true E2EE
  // Backend NEVER processes plaintext images
  // All thumbnail generation must happen client-side before encryption
}
