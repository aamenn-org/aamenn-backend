import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { VaultSecurityService } from '../vault/vault-security.service';
import { OtpService } from '../otp/otp.service';
import { RegisterDto, LoginDto, RefreshTokenDto, GoogleLoginDto, VaultResetRequestDto, VaultResetVerifyDto, VaultResetParamsDto, VaultResetCompleteDto } from './dto';
import { TokenResponse } from './interfaces/jwt-payload.interface';
import { UserRole } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { CryptoValidator } from '../../common/validators/crypto.validator';

const AUTH_PROVIDER = {
  LOCAL: 'local',
  GOOGLE: 'google',
} as const;

const BCRYPT_ROUNDS = 12;
const TOKEN_TYPE = 'Bearer';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly otpService: OtpService,
    private readonly vaultSecurityService: VaultSecurityService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  /**
   * Register a new user with email and password
   *
   * Zero-Knowledge Flow:
   * 1. Client generates salt + derives KEK + encrypts master key
   * 2. Server stores encryptedMasterKey (cannot decrypt it)
   * 3. Password is hashed with bcrypt for server-side auth only
   */
  async register(
    dto: RegisterDto,
  ): Promise<TokenResponse & { userId: string }> {
    // Check if user already exists
    const existingUser = await this.usersService.findUser({ email: dto.email });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // SECURITY: Validate cryptographic parameters
    CryptoValidator.validateBase64Format(dto.encryptedMasterKey, 'encryptedMasterKey');
    CryptoValidator.validateEncryptedDataFormat(dto.encryptedMasterKey);
    CryptoValidator.validateBase64Format(dto.kekSalt, 'kekSalt');
    CryptoValidator.validateKdfParams(dto.kdfParams);

    // Hash password for authentication (server-side auth only)
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Create user with local auth provider
    const authProviderId = `${AUTH_PROVIDER.LOCAL}:${dto.email}`;
    const user = await this.usersService.findOrCreate(
      authProviderId,
      dto.email,
      hashedPassword,
      AUTH_PROVIDER.LOCAL,
      dto.displayName,
    );

    // Store encrypted master key, KDF params, and recovery fields
    await this.usersService.setupUserSecurity(user.id, {
      encryptedMasterKey: dto.encryptedMasterKey,
      kekSalt: dto.kekSalt,
      kdfParams: dto.kdfParams,
      recoveryEncryptedMasterKey: dto.recoveryEncryptedMasterKey,
      recoverySalt: dto.recoverySalt,
      recoveryKdfParams: dto.recoveryKdfParams,
      encryptedRecoveryKey: dto.encryptedRecoveryKey,
    });

    // Send welcome email (non-blocking)
    this.mailService.sendWelcomeEmail(dto.email, dto.displayName || dto.email).catch(err => {
      // Welcome email failure shouldn't break registration
      this.logger.warn('Welcome email failed:', err.message);
    });

    // Generate tokens with refresh token tracking
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      ...tokens,
      userId: user.id,
      encryptedMasterKey: dto.encryptedMasterKey,
      kekSalt: dto.kekSalt,
      kdfParams: dto.kdfParams,
    };
  }

  /**
   * Authenticate user with email and password
   *
   * Returns encrypted master key + KDF params for client-side decryption
   * Client derives KEK from password and decrypts master key locally
   */
  async login(dto: LoginDto): Promise<TokenResponse> {
    // First try to find user by email (supports both local and Google users)
    let user = await this.usersService.findUser({ email: dto.email });
    
    // If not found by email, try the old way for backward compatibility
    if (!user) {
      const authProviderId = `${AUTH_PROVIDER.LOCAL}:${dto.email}`;
      user = await this.usersService.findUser({ authProviderId });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // For local users, verify password hash
    if (user.authProvider === 'local' && user.passwordHash) {
      const isPasswordValid = await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }
    } else if (user.authProvider === 'google') {
      // For Google users, verify the vault password
      await this.vaultSecurityService.verifyVaultPassword(user.id, dto.password);
    } else {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    // Update last login timestamp
    await this.usersService.updateLastLogin(user.id);

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Get encrypted master key and KDF params for client-side decryption
    const security = await this.vaultSecurityService.getVaultSecurity(user.id);

    return {
      ...tokens,
      role: user.role,
      authProvider: user.authProvider || undefined,
      encryptedMasterKey: security?.encryptedMasterKey,
      kekSalt: security?.kekSalt,
      kdfParams: security?.kdfParams,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refresh(dto: RefreshTokenDto): Promise<TokenResponse> {
    try {
      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      
      if (!jwtSecret) {
        throw new Error('JWT_SECRET not configured');
      }
      
      // Verify JWT signature and expiration
      const payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: jwtSecret,
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Hash the token to look up in database
      const tokenHash = this.hashToken(dto.refreshToken);
      
      // Find the refresh token in database
      const storedToken = await this.refreshTokenRepository.findOne({
        where: { tokenHash, userId: payload.sub },
      });

      if (!storedToken) {
        throw new UnauthorizedException('Refresh token not found');
      }

      // Check if token is revoked
      if (storedToken.isRevoked) {
        // Token reuse detected - revoke all user tokens (security breach)
        await this.refreshTokenRepository.update(
          { userId: payload.sub, isRevoked: false },
          { isRevoked: true }
        );
        throw new UnauthorizedException(
          'Token reuse detected. All sessions have been revoked for security.'
        );
      }

      // Check if token is expired
      if (new Date() > storedToken.expiresAt) {
        throw new UnauthorizedException('Refresh token expired');
      }

      // Get user
      const user = await this.usersService.findUser({ id: payload.sub });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (!user.isActive) {
        throw new UnauthorizedException('Account is disabled');
      }

      // CRITICAL: Revoke the old refresh token (rotation)
      storedToken.isRevoked = true;
      await this.refreshTokenRepository.save(storedToken);

      // Generate new tokens (with new refresh token)
      return this.generateTokens(user.id, user.email, user.role);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole = UserRole.USER,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenResponse> {
    const accessTokenExpiration = this.configService.get<string>(
      'JWT_ACCESS_EXPIRATION',
      '15m',
    );
    const refreshTokenExpiration = this.configService.get<string>(
      'JWT_REFRESH_EXPIRATION',
      '7d',
    );

    const accessToken = await this.jwtService.signAsync(
      {
        sub: userId,
        email,
        role,
        type: 'access',
      },
      { expiresIn: accessTokenExpiration },
    );

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: userId,
        type: 'refresh',
      },
      { expiresIn: refreshTokenExpiration },
    );

    // Store refresh token hash in database
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setMilliseconds(
      expiresAt.getMilliseconds() + this.parseExpiration(refreshTokenExpiration)
    );

    const refreshTokenEntity = this.refreshTokenRepository.create({
      userId,
      tokenHash,
      expiresAt,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
    });

    await this.refreshTokenRepository.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken,
      tokenType: TOKEN_TYPE,
      expiresIn: this.parseExpiration(accessTokenExpiration),
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.refreshTokenRepository.update(
      { userId, tokenHash },
      { isRevoked: true }
    );
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true }
    );
  }

  /**
   * Login with Google ID token
   * Verifies token, creates/finds user, and returns JWT tokens
   */
  async googleLogin(dto: GoogleLoginDto): Promise<TokenResponse & { requiresVaultSetup: boolean }> {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    
    if (!googleClientId) {
      throw new BadRequestException('Google authentication is not configured');
    }

    // Verify Google ID token
    const client = new OAuth2Client(googleClientId);
    let payload;
    
    try {
      const ticket = await client.verifyIdToken({
        idToken: dto.idToken,
        audience: googleClientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      // SECURITY: Don't log error details (may contain sensitive token data)
      throw new UnauthorizedException('Invalid Google ID token');
    }

    // Validate payload
    if (!payload) {
      throw new UnauthorizedException('Invalid Google ID token payload');
    }

    if (!payload.email) {
      throw new UnauthorizedException('Email not provided by Google');
    }

    if (!payload.email_verified) {
      throw new UnauthorizedException('Email not verified by Google. Please verify your email with Google first.');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Google user ID not provided');
    }

    const authProviderId = `${AUTH_PROVIDER.GOOGLE}:${payload.sub}`;
    
    // Check if user is new by trying to find first
    const existingUser = await this.usersService.findUser({ authProviderId });
    const isNewUser = !existingUser;
    
    const user = await this.usersService.findOrCreate(
      authProviderId,
      payload.email,
      undefined,
      AUTH_PROVIDER.GOOGLE,
      payload.name || payload.email.split('@')[0],
    );

    await this.usersService.updateLastLogin(user.id);

    // Send welcome email to new Google users (non-blocking)
    if (isNewUser) {
      this.mailService.sendWelcomeEmail(
        payload.email,
        payload.name || payload.email.split('@')[0]
      ).catch(err => {
        // Welcome email failure shouldn't break login
        this.logger.warn('Welcome email failed for Google user:', err.message);
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    const security = await this.vaultSecurityService.getVaultSecurity(user.id);
    const requiresVaultSetup = !security;

    return {
      ...tokens,
      role: user.role,
      authProvider: user.authProvider || undefined,
      encryptedMasterKey: security?.encryptedMasterKey,
      kekSalt: security?.kekSalt,
      kdfParams: security?.kdfParams,
      requiresVaultSetup,
    };
  }

  // ==================== VAULT RESET (Forgot Password) ====================

  /**
   * Step 1: Request OTP for vault reset
   */
  async vaultResetRequest(dto: VaultResetRequestDto): Promise<void> {
    // Always return success to prevent email enumeration
    const user = await this.usersService.findUser({ email: dto.email });
    if (!user) {
      return;
    }

    const security = await this.vaultSecurityService.getVaultSecurity(user.id);
    if (!security || !security.recoveryEncryptedMasterKey) {
      // User has no recovery key set up — can't reset
      return;
    }
    
    const otp = await this.otpService.generateOtp(dto.email);
    await this.mailService.sendOtpEmail(dto.email, otp, this.otpService.getOtpTtlMinutes());
  }

  /**
   * Step 2: Verify OTP and return a short-lived reset session token
   */
  async vaultResetVerify(dto: VaultResetVerifyDto): Promise<{ resetToken: string }> {
    const user = await this.usersService.findUser({ email: dto.email });
    if (!user) {
      throw new UnauthorizedException('Invalid email or OTP');
    }

    const valid = await this.otpService.verifyOtp(dto.email, dto.otp);
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const resetToken = await this.otpService.createResetSession(user.id);
    return { resetToken };
  }

  /**
   * Step 3: Get recovery params so client can decrypt masterKey with recovery key
   */
  async vaultResetGetParams(dto: VaultResetParamsDto) {
    const userId = await this.otpService.validateResetSession(dto.resetToken);
    if (!userId) {
      throw new UnauthorizedException('Invalid or expired reset session');
    }

    const security = await this.vaultSecurityService.getVaultSecurity(userId);
    if (!security || !security.recoveryEncryptedMasterKey) {
      throw new BadRequestException('Recovery key not configured for this account');
    }

    return {
      recoveryEncryptedMasterKey: security.recoveryEncryptedMasterKey,
      recoverySalt: security.recoverySalt,
      recoveryKdfParams: security.recoveryKdfParams,
    };
  }

  /**
   * Step 4: Complete vault reset — update password wrapper
   */
  async vaultResetComplete(dto: VaultResetCompleteDto): Promise<void> {
    const userId = await this.otpService.validateResetSession(dto.resetToken);
    if (!userId) {
      throw new UnauthorizedException('Invalid or expired reset session');
    }

    const user = await this.usersService.findUser({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Update password hash for local users
    if (user.authProvider === 'local') {
      const newHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
      await this.usersService.updatePasswordHash(userId, newHash);
    }

    // Update vault encryption wrapper
    await this.usersService.updateSecurityParams(
      userId,
      dto.newEncryptedMasterKey,
      dto.newKekSalt,
      dto.newKdfParams,
    );

    // Revoke all refresh tokens for security
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );

    // Consume the reset session
    await this.otpService.consumeResetSession(dto.resetToken);
  }

  /**
   * Parse expiration string to seconds
   */
  private parseExpiration(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return value * (multipliers[unit] || 60);
  }

}
