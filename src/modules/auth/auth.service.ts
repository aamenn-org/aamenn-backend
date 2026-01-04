import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto';
import { TokenResponse } from './interfaces/jwt-payload.interface';

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

    // Hash password for authentication (server-side auth only)
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Create user with local auth provider
    const authProviderId = `${AUTH_PROVIDER.LOCAL}:${dto.email}`;
    const user = await this.usersService.findOrCreate(
      authProviderId,
      dto.email,
      hashedPassword,
      AUTH_PROVIDER.LOCAL,
    );

    // Store encrypted master key and KDF params
    await this.usersService.setupUserSecurity(user.id, {
      encryptedMasterKey: dto.encryptedMasterKey,
      kekSalt: dto.kekSalt,
      kdfParams: dto.kdfParams,
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, dto.email);

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

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user.id, user.email);

    // Get encrypted master key and KDF params for client-side decryption
    const security = await this.usersService.getUserSecurity(user.id);

    return {
      ...tokens,
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
      const payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.usersService.findUser({ id: payload.sub });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(user.id, user.email);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(
    userId: string,
    email: string,
  ): Promise<TokenResponse> {
    const accessTokenExpiration = this.configService.get<string>(
      'JWT_ACCESS_EXPIRATION',
      '15m',
    );
    const refreshTokenExpiration = this.configService.get<string>(
      'JWT_REFRESH_EXPIRATION',
      '7d',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: userId,
          email,
          type: 'access',
        },
        { expiresIn: accessTokenExpiration },
      ),
      this.jwtService.signAsync(
        {
          sub: userId,
          email,
          type: 'refresh',
        },
        { expiresIn: refreshTokenExpiration },
      ),
    ]);

    // Parse expiration for response
    const expiresIn = this.parseExpiration(accessTokenExpiration);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: TOKEN_TYPE,
    };
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

  /**
   * Get encryption keys for authenticated user
   * Used for re-unlocking master key after page refresh
   */
  async getEncryptionKeys(userId: string): Promise<{
    encryptedMasterKey: string;
    kekSalt: string;
    kdfParams?: Record<string, any>;
  }> {
    const security = await this.usersService.getUserSecurity(userId);

    if (!security?.encryptedMasterKey || !security?.kekSalt) {
      throw new BadRequestException('Encryption keys not found for user');
    }

    return {
      encryptedMasterKey: security.encryptedMasterKey,
      kekSalt: security.kekSalt,
      kdfParams: security.kdfParams,
    };
  }
}
