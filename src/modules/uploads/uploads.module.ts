import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { UploadCleanupService } from './upload-cleanup.service';
import { UploadSession } from '../../database/entities/upload-session.entity';
import { File } from '../../database/entities/file.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UploadSession, File])],
  controllers: [UploadsController],
  providers: [UploadsService, UploadCleanupService],
  exports: [UploadsService],
})
export class UploadsModule {}
