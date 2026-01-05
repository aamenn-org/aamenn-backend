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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreateUserSecurityDto } from './dto/create-user-security.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
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
  constructor(private readonly usersService: UsersService) {}

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

    const security = await this.usersService.getUserSecurity(user.id);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      hasSecuritySetup: !!security,
      authProvider: user.authProvider,
      createdAt: user.createdAt,
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
    } else if (user.authProvider !== 'local') {
      // For OAuth users, we might want a different verification method
      // For now, we'll allow deletion without password (they can re-auth)
      throw new ForbiddenException(
        'Account deletion for OAuth users is not yet supported. Please contact support.',
      );
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
  @Get('security')
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
    const security = await this.usersService.getUserSecurity(authUser.userId);

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
  @Post('security')
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
    const existingSecurity = await this.usersService.getUserSecurity(
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
}
