import {
  Controller,
  Post,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
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
import { Throttle } from '@nestjs/throttler';
import { AuthThrottleGuard } from '../../common/guards/auth-throttle.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  RegisterResponseDto,
  ChangePasswordDto,
  LogoutDto,
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
  @UseGuards(AuthThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
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
  @UseGuards(AuthThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
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
  @UseGuards(AuthThrottleGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 refresh attempts per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: `Get a new access token using a valid refresh token.
    
**Security Features:**
- Refresh token rotation: Old token is revoked, new token issued
- Token reuse detection: If revoked token is reused, all user sessions are terminated
- Server-side token tracking: All refresh tokens stored as hashes in database`,
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'New access token generated',
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

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Logout (revoke refresh token)',
    description: 'Revoke the provided refresh token to logout from current session',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully logged out',
  })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogoutDto,
  ) {
    await this.authService.logout(user.userId, dto.refreshToken);
    return {
      success: true,
      message: 'Successfully logged out',
    };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Logout from all sessions',
    description: 'Revoke all refresh tokens for the authenticated user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully logged out from all sessions',
  })
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logoutAll(user.userId);
    return {
      success: true,
      message: 'Successfully logged out from all sessions',
    };
  }
}
