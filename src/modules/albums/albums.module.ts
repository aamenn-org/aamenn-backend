import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Album } from '../../database/entities/album.entity';
import { AlbumFile } from '../../database/entities/album-file.entity';
import { AlbumsService } from './albums.service';
import { AlbumsController } from './albums.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [TypeOrmModule.forFeature([Album, AlbumFile]), FilesModule],
  controllers: [AlbumsController],
  providers: [AlbumsService],
  exports: [AlbumsService],
})
export class AlbumsModule {}
