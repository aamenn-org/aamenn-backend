import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto';
import { TokenResponse } from './interfaces/jwt-payload.interface';
import { UserRole } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { CryptoValidator } from '../../common/validators/crypto.validator';

const AUTH_PROVIDER = {
  LOCAL: 'local',
} as const;

const BCRYPT_ROUNDS = 12;
const TOKEN_TYPE = 'Bearer';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
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

    // Store encrypted master key and KDF params
    await this.usersService.setupUserSecurity(user.id, {
      encryptedMasterKey: dto.encryptedMasterKey,
      kekSalt: dto.kekSalt,
      kdfParams: dto.kdfParams,
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
    const authProviderId = `${AUTH_PROVIDER.LOCAL}:${dto.email}`;
    const user = await this.usersService.findUser({ authProviderId });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login timestamp
    await this.usersService.updateLastLogin(user.id);

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Get encrypted master key and KDF params for client-side decryption
    const security = await this.usersService.getUserSecurity(user.id);

    return {
      ...tokens,
      role: user.role,
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
        await this.revokeAllUserTokens(payload.sub);
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

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true }
    );
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.refreshTokenRepository.update(
      { userId, tokenHash },
      { isRevoked: true }
    );
  }

  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllUserTokens(userId);
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
