import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { VaultSecurityService } from '../vault/vault-security.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreateUserSecurityDto } from './dto/create-user-security.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import {
  CurrentUserResponseDto,
  UserSecurityResponseDto,
  SecuritySetupResponseDto,
} from './dto/user-response.dto';
import { ErrorResponseDto } from '../../common/dto';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly vaultSecurityService: VaultSecurityService,
  ) {}

  /**
   * Get current user's profile.
   * Also ensures user exists in our database.
   */
  @Get('me')
  @ApiOperation({
    summary: 'Get current user',
    description: 'Returns the authenticated user profile',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Current user profile',
    type: CurrentUserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Authentication required',
    type: ErrorResponseDto,
  })
  async getCurrentUser(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<CurrentUserResponseDto> {
    // Note: findUser is used here to get full user data (createdAt, etc.)
    // since JWT only contains userId and email
    const user = await this.usersService.findUser({ id: authUser.userId });

    if (!user) {
      // This shouldn't happen if JWT is valid, but handle edge case
      throw new ConflictException('User not found');
    }

    const hasSecuritySetup = await this.vaultSecurityService.isVaultConfigured(user.id);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      hasSecuritySetup,
      authProvider: user.authProvider,
      avatarFileId: user.avatarFileId,
      createdAt: user.createdAt,
      trashRetentionDays: user.trashRetentionDays,
    };
  }

  /**
   * Update current user's profile.
   */
  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update profile',
    description: 'Update the authenticated user profile information',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile updated successfully',
  })
  async updateProfile(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    const user = await this.usersService.updateProfile(authUser.userId, dto);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarFileId: user.avatarFileId,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Delete current user's account permanently.
   * Requires password verification for security.
   */
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete account',
    description: `Permanently delete the authenticated user's account and all associated data.
    
**WARNING:** This action is irreversible. All files, albums, and encryption keys will be permanently deleted.

Requires password verification for local auth users.`,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Account deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid password',
    type: ErrorResponseDto,
  })
  async deleteAccount(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ) {
    // Get user to verify password
    const user = await this.usersService.findUser({ id: authUser.userId });

    if (!user) {
      throw new ConflictException('User not found');
    }

    // Verify password for local auth users
    if (user.authProvider === 'local' && user.passwordHash) {
      const isPasswordValid = await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid password');
      }
    } else if (user.authProvider === 'google') {
      // For Google users, verify the vault password
      await this.vaultSecurityService.verifyVaultPassword(user.id, dto.password);
      this.logger.log(`Google user ${user.email} vault password verified for account deletion`);
    } else {
      // For other OAuth providers, allow deletion without password for now
      this.logger.log(`OAuth user ${user.email} (${user.authProvider}) deleting account`);
    }

    // Delete account and all associated data
    await this.usersService.deleteAccount(authUser.userId);

    return {
      success: true,
      message: 'Account deleted successfully',
    };
  }

  /**
   * Get user's security parameters (encrypted master key and KDF params).
   * Client uses these to derive KEK and decrypt master key locally.
   */
  @Get('me/security')
  @ApiOperation({
    summary: 'Get security parameters',
    description: `Returns the user's security parameters for zero-knowledge encryption.
    
**Zero-Knowledge Flow:**
- Client retrieves encryptedMasterKey, kekSalt, and KDF params
- Client derives KEK from password using KDF(password, kekSalt)
- Client decrypts master key locally: masterKey = AES-GCM-decrypt(encryptedMasterKey, KEK)
- Server NEVER sees the plaintext master key or password`,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User security parameters',
    type: UserSecurityResponseDto,
  })
  async getUserSecurity(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<UserSecurityResponseDto> {
    const security = await this.vaultSecurityService.getVaultSecurity(authUser.userId);

    if (!security) {
      return {
        configured: false,
        encryptedMasterKey: null,
        kekSalt: null,
        kdfParams: null,
      };
    }

    return {
      configured: true,
      encryptedMasterKey: security.encryptedMasterKey,
      kekSalt: security.kekSalt,
      kdfParams: security.kdfParams,
    };
  }

  /**
   * Set up user's security parameters.
   * Called once during registration with encrypted master key.
   * NOTE: This is now handled automatically during registration.
   * This endpoint is kept for manual setup if needed.
   */
  @Post('me/security')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Setup security parameters',
    description: `Sets up the user's security parameters for zero-knowledge encryption.
    
**Zero-Knowledge Flow:**
- Client generates random Master Key
- Client derives KEK from password using KDF(password, kekSalt)
- Client encrypts Master Key with KEK
- Backend stores encryptedMasterKey but can NEVER decrypt it
- This endpoint can only be called once per user`,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Security parameters configured',
    type: SecuritySetupResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Security parameters already configured',
    type: ErrorResponseDto,
  })
  async setupUserSecurity(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: CreateUserSecurityDto,
  ): Promise<SecuritySetupResponseDto> {
    const existingSecurity = await this.vaultSecurityService.getVaultSecurity(
      authUser.userId,
    );
    if (existingSecurity) {
      throw new ConflictException('Security parameters already configured');
    }

    await this.usersService.setupUserSecurity(authUser.userId, dto);

    return {
      success: true,
      message: 'Security parameters configured successfully',
    };
  }

  /**
   * Change vault password.
   * Client re-wraps the same masterKey with a new password-derived KEK.
   * No file re-encryption needed — only the key wrapper changes.
   */
  @Patch('me/vault-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change vault password',
    description: `Change the user's vault password. The masterKey stays the same — only its encryption wrapper is updated.

**Flow:**
1. Client decrypts masterKey with current password
2. Client re-encrypts masterKey with new password
3. Server updates encryptedMasterKey, kekSalt, and passwordHash`,
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Vault password changed' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid current password', type: ErrorResponseDto })
  async changeVaultPassword(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    const user = await this.usersService.findUser({ id: authUser.userId });
    if (!user) {
      throw new ConflictException('User not found');
    }

    // Verify current password for local users
    if (user.authProvider === 'local' && user.passwordHash) {
      const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    // Update password hash for local users
    if (user.authProvider === 'local') {
      const newHash = await bcrypt.hash(dto.newPassword, 12);
      await this.usersService.updatePasswordHash(authUser.userId, newHash);
    }

    // Update vault encryption wrapper (same masterKey, new KEK)
    await this.usersService.updateSecurityParams(
      authUser.userId,
      dto.newEncryptedMasterKey,
      dto.newKekSalt,
      dto.newKdfParams,
    );

    return {
      success: true,
      message: 'Vault password changed successfully',
    };
  }

  /**
   * Get storage usage for the authenticated user.
   */
  @Get('me/storage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get storage usage',
    description: `Returns the current storage usage for the authenticated user.

**Response includes:**
- usedBytes: Total bytes currently used
- usedGb: Usage in gigabytes (rounded to 2 decimals)
- limitBytes: Maximum allowed storage in bytes
- limitGb: Maximum allowed storage in gigabytes
- fileCount: Number of files
- exceeded: Boolean indicating if limit is reached
- percentUsed: Usage as a percentage (0-100)`,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Storage usage retrieved successfully',
  })
  async getStorageUsage(@CurrentUser() authUser: AuthenticatedUser) {
    return this.usersService.getStorageUsage(authUser.userId);
  }
}
