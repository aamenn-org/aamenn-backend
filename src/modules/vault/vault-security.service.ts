import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSecurity } from '../../database/entities/user-security.entity';
import { deriveKEK, decryptMasterKey } from '../../common/utils/crypto';

/**
 * VaultSecurityService
 * 
 * Centralized service for vault password verification and security operations.
 * Single source of truth for vault password validation logic.
 */
@Injectable()
export class VaultSecurityService {
  private readonly logger = new Logger(VaultSecurityService.name);

  constructor(
    @InjectRepository(UserSecurity)
    private readonly userSecurityRepository: Repository<UserSecurity>,
  ) {}

  /**
   * Get user's vault security configuration.
   * Returns null if not configured.
   */
  async getVaultSecurity(userId: string): Promise<UserSecurity | null> {
    return this.userSecurityRepository.findOne({ where: { userId } });
  }

  /**
   * Check if vault is configured for a user.
   */
  async isVaultConfigured(userId: string): Promise<boolean> {
    const security = await this.getVaultSecurity(userId);
    return !!(security?.encryptedMasterKey && security?.kekSalt);
  }

  /**
   * Check if recovery is configured for a user.
   */
  async isRecoveryConfigured(userId: string): Promise<boolean> {
    const security = await this.getVaultSecurity(userId);
    return !!(security?.recoveryEncryptedMasterKey && security?.recoverySalt);
  }

  /**
   * Verify vault password by attempting to decrypt the master key.
   * Throws UnauthorizedException if password is invalid or vault not configured.
   * 
   * This is the single source of truth for vault password verification.
   */
  async verifyVaultPassword(userId: string, password: string): Promise<void> {
    const security = await this.getVaultSecurity(userId);

    if (!security) {
      throw new UnauthorizedException('Vault not configured');
    }

    if (!security.encryptedMasterKey || !security.kekSalt) {
      throw new UnauthorizedException('Vault security incomplete');
    }

    try {
      const kek = await deriveKEK(password, security.kekSalt);
      await decryptMasterKey(security.encryptedMasterKey, kek);
      // Success - password is valid
    } catch (error) {
      // Decryption failed - invalid password
      throw new UnauthorizedException('Invalid vault password');
    }
  }

  /**
   * Get vault security or throw if not configured.
   */
  async getVaultSecurityOrThrow(userId: string): Promise<UserSecurity> {
    const security = await this.getVaultSecurity(userId);
    
    if (!security) {
      throw new UnauthorizedException('Vault not configured');
    }

    if (!security.encryptedMasterKey || !security.kekSalt) {
      throw new UnauthorizedException('Vault security incomplete');
    }

    return security;
  }
}
