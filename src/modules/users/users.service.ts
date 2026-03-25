import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { UserSecurity } from '../../database/entities/user-security.entity';
import { File } from '../../database/entities/file.entity';
import { Folder } from '../../database/entities/folder.entity';
import { UploadSession } from '../../database/entities/upload-session.entity';
import { CreateUserSecurityDto } from './dto/create-user-security.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { B2StorageService } from '../storage/b2-storage.service';
import { FilesService } from '../files/files.service';

/**
 * Options for finding a user - exactly one must be provided
 */
export interface FindUserOptions {
  id?: string;
  email?: string;
  authProviderId?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserSecurity)
    private userSecurityRepository: Repository<UserSecurity>,
    @InjectRepository(File)
    private filesRepository: Repository<File>,
    @InjectRepository(Folder)
    private foldersRepository: Repository<Folder>,
    @InjectRepository(UploadSession)
    private uploadSessionsRepository: Repository<UploadSession>,
    private b2StorageService: B2StorageService,
    private filesService: FilesService,
  ) {}

  /**
   * Find a user by ID, email, or auth provider ID.
   * Centralized method - use this instead of multiple find methods.
   */
  async findUser(options: FindUserOptions): Promise<User | null> {
    const { id, email, authProviderId } = options;

    if (id) {
      return this.usersRepository.findOne({ where: { id } });
    }
    if (email) {
      return this.usersRepository.findOne({ where: { email } });
    }
    if (authProviderId) {
      return this.usersRepository.findOne({ where: { authProviderId } });
    }

    return null;
  }

  /**
   * Find or create a user based on their auth provider ID.
   * This is called on first login to ensure the user exists in our DB.
   */
  async findOrCreate(
    authProviderId: string,
    email?: string,
    passwordHash?: string,
    authProvider?: string,
    displayName?: string,
  ): Promise<User> {
    let user = await this.findUser({ authProviderId });

    if (!user && email) {
      // Try to find by email in case the user already exists
      user = await this.findUser({ email });
    }

    if (!user) {
      user = this.usersRepository.create({
        authProviderId,
        email: email || `${authProviderId}@unknown.auth`,
        passwordHash,
        authProvider,
        displayName,
      });
      await this.usersRepository.save(user);
    } else if (email && user.email !== email) {
      // Update email if changed at the provider
      user.email = email;
      await this.usersRepository.save(user);
    }

    return user;
  }

  /**
   * Get storage usage for a user (delegates to FilesService).
   */
  async getStorageUsage(userId: string) {
    return this.filesService.getStorageUsage(userId);
  }

  /**
   * Set up user's security parameters (zero-knowledge encryption).
   * Called during registration with the encrypted master key.
   * Server stores encryptedMasterKey but can NEVER decrypt it.
   */
  async setupUserSecurity(
    userId: string,
    dto: CreateUserSecurityDto,
  ): Promise<UserSecurity> {
    const existing = await this.userSecurityRepository.findOne({
      where: { userId },
    });

    if (existing) {
      throw new Error('User security already configured');
    }

    const userSecurity = this.userSecurityRepository.create({
      userId,
      encryptedMasterKey: dto.encryptedMasterKey,
      kekSalt: dto.kekSalt,
      kdfParams: dto.kdfParams,
      recoveryEncryptedMasterKey: dto.recoveryEncryptedMasterKey || null,
      recoverySalt: dto.recoverySalt || null,
      recoveryKdfParams: dto.recoveryKdfParams || null,
      encryptedRecoveryKey: dto.encryptedRecoveryKey || null,
    });

    return this.userSecurityRepository.save(userSecurity);
  }

  /**
   * Update user's security parameters (for password change).
   * Re-encrypts master key with new KEK derived from new password.
   * The masterKey itself is unchanged — only its wrapping changes.
   */
  async updateSecurityParams(
    userId: string,
    encryptedMasterKey: string,
    kekSalt: string,
    kdfParams?: Record<string, any>,
  ): Promise<UserSecurity> {
    const security = await this.userSecurityRepository.findOne({
      where: { userId },
    });

    if (!security) {
      throw new Error('Security parameters not found');
    }

    security.encryptedMasterKey = encryptedMasterKey;
    security.kekSalt = kekSalt;
    if (kdfParams) {
      security.kdfParams = kdfParams as any;
    }

    return this.userSecurityRepository.save(security);
  }

  /**
   * Update user profile information.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found');
    }

    if (dto.displayName !== undefined) {
      user.displayName = dto.displayName;
    }

    if (dto.avatarFileId !== undefined) {
      user.avatarFileId = dto.avatarFileId;
    }

    if (dto.trashRetentionDays !== undefined) {
      user.trashRetentionDays = dto.trashRetentionDays;
    }

    return this.usersRepository.save(user);
  }

  /**
   * Update user's last login timestamp.
   */
  async updateLastLogin(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { lastLoginAt: new Date() });
  }

  /**
   * Update user's password hash.
   */
  async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.usersRepository.update(userId, { passwordHash });
  }

  /**
   * Update Google access token for user.
   */
  async updateGoogleAccessToken(
    userId: string,
    accessToken: string,
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.usersRepository.update(userId, {
      googleAccessToken: accessToken,
      googleTokenExpiresAt: expiresAt,
    });
  }

  /**
   * Get Google access token for user if not expired.
   */
  async getGoogleAccessToken(userId: string): Promise<string | null> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['googleAccessToken', 'googleTokenExpiresAt'],
    });

    if (!user?.googleAccessToken || !user?.googleTokenExpiresAt) {
      return null;
    }

    if (new Date() > user.googleTokenExpiresAt) {
      return null;
    }

    return user.googleAccessToken;
  }

  /**
   * Delete user account and all associated data.
   * This includes: files from B2, folders, user_security, user.
   */
  async deleteAccount(userId: string): Promise<void> {
    this.logger.log(`Deleting account for user: ${userId}`);

    // 1. Get all user's files (including soft-deleted)
    const files = await this.filesRepository.find({
      where: { userId },
      withDeleted: true,
    });

    // 2. Delete files from B2 storage
    if (files.length > 0) {
      const b2Paths: string[] = [];
      for (const file of files) {
        if (file.b2FilePath) b2Paths.push(file.b2FilePath);
        if (file.b2ThumbSmallPath) b2Paths.push(file.b2ThumbSmallPath);
        if (file.b2ThumbMediumPath) b2Paths.push(file.b2ThumbMediumPath);
      }

      try {
        if (b2Paths.length > 0) {
          await this.b2StorageService.deleteFiles(b2Paths);
          this.logger.log(`Deleted ${b2Paths.length} files from B2`);
        }
      } catch (error) {
        this.logger.error('Failed to delete some files from B2:', error);
        // Continue with database cleanup even if B2 fails
      }
    }

    // 3. Delete all files from database
    await this.filesRepository.delete({ userId });

    // 4. Delete all folders
    await this.foldersRepository.delete({ userId });

    // 5c. Cancel and delete all upload sessions
    const activeSessions = await this.uploadSessionsRepository.find({
      where: { userId, status: 'active' as const },
    });
    for (const session of activeSessions) {
      try {
        await this.b2StorageService.cancelLargeFile(session.b2FileId);
      } catch {
        // Best effort — B2 may have already cleaned up
      }
    }
    await this.uploadSessionsRepository.delete({ userId });

    // 6. Delete user security
    await this.userSecurityRepository.delete({ userId });

    // 7. Delete user
    await this.usersRepository.delete({ id: userId });

    this.logger.log(`Account deleted for user: ${userId}`);
  }
}
