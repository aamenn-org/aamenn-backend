import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { UserSecurity } from '../../database/entities/user-security.entity';
import { File } from '../../database/entities/file.entity';
import { Folder } from '../../database/entities/folder.entity';
import { UploadSession } from '../../database/entities/upload-session.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { FilesModule } from '../files/files.module';
import { StorageModule } from '../storage/storage.module';
import { VaultModule } from '../vault/vault.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSecurity, File, Folder, UploadSession]),
    FilesModule,
    VaultModule,
    forwardRef(() => StorageModule),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
