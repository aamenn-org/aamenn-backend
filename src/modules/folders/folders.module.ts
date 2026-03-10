import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Folder } from '../../database/entities/folder.entity';
import { File } from '../../database/entities/file.entity';
import { FoldersService } from './folders.service';
import { FoldersController } from './folders.controller';
import { StorageModule } from '../storage/storage.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Folder, File]),
    forwardRef(() => StorageModule),
    CacheModule,
  ],
  controllers: [FoldersController],
  providers: [FoldersService],
  exports: [FoldersService],
})
export class FoldersModule {}
