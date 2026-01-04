import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  ConflictException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreateUserSecurityDto } from './dto/create-user-security.dto';
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
      hasSecuritySetup: !!security,
      createdAt: user.createdAt,
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
