import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../../database/entities/user.entity';
import { File } from '../../database/entities/file.entity';
import { DownloadLog } from '../../database/entities/download-log.entity';
import { Plan } from '../../database/entities/plan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, File, DownloadLog, Plan])],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
