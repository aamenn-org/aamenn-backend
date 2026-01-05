import {
  Controller,
  Post,
  Body,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  RegisterResponseDto,
  ChangePasswordDto,
} from './dto';
import { ErrorResponseDto } from '../../common/dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user with email and password
   * Stores encrypted master key for zero-knowledge encryption
   */
  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register new user',
    description: `Create a new user account with email and password.

**Zero-Knowledge Encryption Flow:**
1. Client generates random salt (kekSalt)
2. Client derives KEK from password: \`KEK = PBKDF2(password, kekSalt, 100000)\`
3. Client generates random Master Key (32 bytes)
4. Client encrypts Master Key: \`encryptedMasterKey = AES-GCM(masterKey, KEK)\`
5. Client sends: email, password, encryptedMasterKey, kekSalt, kdfParams

Server stores the encrypted master key but can NEVER decrypt it.`,
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description:
      'User registered successfully. Returns JWT tokens and encryption parameters.',
    type: RegisterResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User with this email already exists',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
    type: ErrorResponseDto,
  })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  /**
   * Authenticate with email and password
   * Returns encrypted master key for client-side decryption
   */
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User login',
    description: `Authenticate user with email and password.

**Zero-Knowledge Encryption Flow:**
1. Server verifies password (bcrypt)
2. Server returns: JWT tokens + encryptedMasterKey + kekSalt + kdfParams
3. Client derives KEK: \`KEK = PBKDF2(password, kekSalt, iterations)\`
4. Client decrypts: \`masterKey = AES-GCM-decrypt(encryptedMasterKey, KEK)\`
5. Master Key is stored in memory only (never localStorage)

Server NEVER sees the plaintext master key.`,
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Login successful. Returns JWT tokens and encryption parameters for client-side key derivation.',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid credentials',
    type: ErrorResponseDto,
  })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  /**
   * Refresh access token
   */
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Get new access token using refresh token',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Token refreshed successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or expired refresh token',
    type: ErrorResponseDto,
  })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto);
  }

  /**
   * Get encryption keys for re-unlocking master key
   * Used after page refresh when master key is cleared from memory
   */
  @Get('encryption-keys')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get encryption keys',
    description: `Get encrypted master key and KDF parameters for re-unlocking.

**Use Case:**
When a user refreshes the page, the master key (stored only in memory for security) is lost.
This endpoint allows the client to retrieve the encrypted master key and re-derive the KEK
from the user's password to unlock it again.

Requires authentication.`,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Encryption keys retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Not authenticated',
    type: ErrorResponseDto,
  })
  async getEncryptionKeys(@CurrentUser() authUser: AuthenticatedUser) {
    return this.authService.getEncryptionKeys(authUser.userId);
  }

  /**
   * Change password with zero-knowledge re-encryption
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change password',
    description: `Change user password with zero-knowledge master key re-encryption.

**Zero-Knowledge Re-Encryption Flow:**
1. Client derives old KEK: \`oldKEK = PBKDF2(currentPassword, oldKekSalt, iterations)\`
2. Client decrypts master key: \`masterKey = AES-GCM-decrypt(encryptedMasterKey, oldKEK)\`
3. Client generates new salt (newKekSalt)
4. Client derives new KEK: \`newKEK = PBKDF2(newPassword, newKekSalt, iterations)\`
5. Client re-encrypts: \`newEncryptedMasterKey = AES-GCM(masterKey, newKEK)\`
6. Client sends: currentPassword, newPassword, newEncryptedMasterKey, newKekSalt
7. Server verifies currentPassword, updates hash and security params

The master key itself NEVER changes - only its encryption wrapper.`,
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password changed successfully',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Current password is incorrect',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
    type: ErrorResponseDto,
  })
  async changePassword(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: boolean }> {
    return this.authService.changePassword(authUser.userId, dto);
  }
}
