import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { B2StorageService } from './b2-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [B2StorageService],
  exports: [B2StorageService],
})
export class StorageModule {}
