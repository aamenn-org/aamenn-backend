import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShareLink } from '../../database/entities/share-link.entity';
import { File } from '../../database/entities/file.entity';
import { Album } from '../../database/entities/album.entity';
import { AlbumFile } from '../../database/entities/album-file.entity';
import { Folder } from '../../database/entities/folder.entity';
import { SharesService } from './shares.service';
import { SharesController } from './shares.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ShareLink, File, Album, AlbumFile, Folder]),
    StorageModule,
  ],
  controllers: [SharesController],
  providers: [SharesService],
  exports: [SharesService],
})
export class SharesModule {}
