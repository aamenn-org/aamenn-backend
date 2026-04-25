import {
  Controller,
  Post,
  Body,
  Get,
  Req,
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
import { SignupIpLimitGuard } from '../../common/guards/signup-ip-limit.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  RegisterResponseDto,
  ChangePasswordDto,
  GoogleLoginDto,
  VaultResetRequestDto,
  VaultResetVerifyDto,
  VaultResetParamsDto,
  VaultResetCompleteDto,
} from './dto';
import { SendSignupOtpDto } from './dto/send-signup-otp.dto';
import { ErrorResponseDto } from '../../common/dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ==================== SIGNUP EMAIL VERIFICATION ====================

  /**
   * Send a 6-digit OTP to verify email before registration
   */
  @Post('register/send-otp')
  @Public()
  @UseGuards(AuthThrottleGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 per minute per IP
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send signup email verification OTP',
    description: 'Sends a 6-digit OTP to the provided email for verification before registration.',
  })
  @ApiBody({ type: SendSignupOtpDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'OTP sent (always returns success to prevent email enumeration)' })
  async sendSignupOtp(@Body() dto: SendSignupOtpDto) {
    await this.authService.sendSignupOtp(dto.email);
    return { message: 'Verification code sent to your email.' };
  }

  /**
   * Register a new user with email and password
   * Stores encrypted master key for zero-knowledge encryption
   */
  @Post('register')
  @Public()
  @UseGuards(AuthThrottleGuard, SignupIpLimitGuard)
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
  async register(@Body() dto: RegisterDto, @Req() req: any): Promise<RegisterResponseDto> {
    const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    return this.authService.register(dto, ip);
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


  @Post('google')
  @Public()
  @UseGuards(AuthThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with Google',
    description: 'Authenticate with Google ID token and get JWT tokens. Returns requiresVaultSetup flag for first-time users.',
  })
  @ApiBody({ type: GoogleLoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Google login successful',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid Google ID token',
    type: ErrorResponseDto,
  })
  async googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto);
  }

  // ==================== VAULT RESET (Forgot Password) ====================

  @Post('vault-reset/request')
  @Public()
  @UseGuards(AuthThrottleGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request vault password reset OTP' })
  @ApiBody({ type: VaultResetRequestDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'OTP sent if email exists' })
  async vaultResetRequest(@Body() dto: VaultResetRequestDto) {
    await this.authService.vaultResetRequest(dto);
    return { success: true, message: 'If the email exists, a reset code has been sent.' };
  }

  @Post('vault-reset/verify')
  @Public()
  @UseGuards(AuthThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and get reset session token' })
  @ApiBody({ type: VaultResetVerifyDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reset session token returned' })
  async vaultResetVerify(@Body() dto: VaultResetVerifyDto) {
    return this.authService.vaultResetVerify(dto);
  }

  @Post('vault-reset/params')
  @Public()
  @UseGuards(AuthThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get recovery params for client-side decryption' })
  @ApiBody({ type: VaultResetParamsDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'Recovery encryption params returned' })
  async vaultResetGetParams(@Body() dto: VaultResetParamsDto) {
    return this.authService.vaultResetGetParams(dto);
  }

  @Post('vault-reset/complete')
  @Public()
  @UseGuards(AuthThrottleGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete vault reset with new password' })
  @ApiBody({ type: VaultResetCompleteDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'Vault password reset successfully' })
  async vaultResetComplete(@Body() dto: VaultResetCompleteDto) {
    await this.authService.vaultResetComplete(dto);
    return { success: true, message: 'Vault password reset successfully. Please login again.' };
  }

}
