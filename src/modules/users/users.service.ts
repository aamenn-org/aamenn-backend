import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { UserSecurity } from '../../database/entities/user-security.entity';
import { CreateUserSecurityDto } from './dto/create-user-security.dto';

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
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserSecurity)
    private userSecurityRepository: Repository<UserSecurity>,
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
}
