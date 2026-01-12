import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { File } from '../../database/entities/file.entity';
import { AlbumFile } from '../../database/entities/album-file.entity';
import { DownloadLog } from '../../database/entities/download-log.entity';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { ThumbnailService } from './thumbnail.service';

@Module({
  imports: [TypeOrmModule.forFeature([File, AlbumFile, DownloadLog])],
  controllers: [FilesController],
  providers: [FilesService, ThumbnailService],
  exports: [FilesService, ThumbnailService],
})
export class FilesModule {}
