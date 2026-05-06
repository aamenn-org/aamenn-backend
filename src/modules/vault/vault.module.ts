import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSecurity } from '../../database/entities/user-security.entity';
import { VaultSecurityService } from './vault-security.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserSecurity])],
  providers: [VaultSecurityService],
  exports: [VaultSecurityService],
})
export class VaultModule {}
