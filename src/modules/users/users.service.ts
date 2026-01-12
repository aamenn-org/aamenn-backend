import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { UserSecurity } from '../../database/entities/user-security.entity';
import { File } from '../../database/entities/file.entity';
import { Album } from '../../database/entities/album.entity';
import { AlbumFile } from '../../database/entities/album-file.entity';
import { CreateUserSecurityDto } from './dto/create-user-security.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { B2StorageService } from '../storage/b2-storage.service';

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
    @InjectRepository(Album)
    private albumsRepository: Repository<Album>,
    @InjectRepository(AlbumFile)
    private albumFilesRepository: Repository<AlbumFile>,
    private b2StorageService: B2StorageService,
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
   * Get user's security parameters (encrypted master key and KDF params).
   * Client uses these to derive KEK and decrypt master key locally.
   */
  async getUserSecurity(userId: string): Promise<UserSecurity | null> {
    const result = await this.userSecurityRepository.findOne({
      where: { userId },
    });

    return result;
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
    });

    return this.userSecurityRepository.save(userSecurity);
  }

  /**
   * Update user's security parameters (for password change).
   * Re-encrypts master key with new KEK derived from new password.
   */
  async updateSecurityParams(
    userId: string,
    encryptedMasterKey: string,
    kekSalt: string,
  ): Promise<UserSecurity> {
    const security = await this.userSecurityRepository.findOne({
      where: { userId },
    });

    if (!security) {
      throw new Error('Security parameters not found');
    }

    security.encryptedMasterKey = encryptedMasterKey;
    security.kekSalt = kekSalt;

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
   * Delete user account and all associated data.
   * This includes: files from B2, albums, album_files, user_security, user.
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

    // 3. Delete all album_files records
    await this.albumFilesRepository.delete({
      file: { userId },
    });

    // 4. Delete all files from database
    await this.filesRepository.delete({ userId });

    // 5. Delete all albums
    await this.albumsRepository.delete({ userId });

    // 6. Delete user security
    await this.userSecurityRepository.delete({ userId });

    // 7. Delete user
    await this.usersRepository.delete({ id: userId });

    this.logger.log(`Account deleted for user: ${userId}`);
  }
}
