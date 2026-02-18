import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Redis from 'ioredis';

/**
 * OtpService
 * 
 * Handles OTP generation, verification, and reset session management.
 * Separated from email delivery concerns for better testability and modularity.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private redis: Redis;
  private readonly otpTtl: number;
  private readonly resetSessionTtl: number;

  constructor(private configService: ConfigService) {
    this.otpTtl = this.configService.get<number>('mail.otpTtlSeconds', 600);
    this.resetSessionTtl = this.configService.get<number>('mail.resetSessionTtlSeconds', 900);
    
    // Initialize Redis
    const redisHost = this.configService.get<string>('redis.host', 'localhost');
    const redisPort = this.configService.get<number>('redis.port', 6379);
    const redisPassword = this.configService.get<string>('redis.password');
    
    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      maxRetriesPerRequest: 3,
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error.message);
    });
  }

  /**
   * Generate and store a 6-digit OTP.
   */
  async generateOtp(email: string): Promise<string> {
    const otp = crypto.randomInt(100000, 999999).toString();
    const key = `vault-reset:otp:${email.toLowerCase()}`;
    const attemptsKey = `vault-reset:otp-attempts:${email.toLowerCase()}`;

    try {
      await this.redis.setex(key, this.otpTtl, otp);
      await this.redis.setex(attemptsKey, this.otpTtl, '0');
    } catch (error) {
      this.logger.error('Failed to store OTP in Redis:', error.message);
      throw error;
    }

    return otp;
  }

  /**
   * Verify OTP with rate limiting (max 5 attempts).
   */
  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const key = `vault-reset:otp:${email.toLowerCase()}`;
    const attemptsKey = `vault-reset:otp-attempts:${email.toLowerCase()}`;

    const attempts = parseInt(await this.redis.get(attemptsKey) || '0', 10);
    if (attempts >= 5) {
      await this.redis.del(key);
      await this.redis.del(attemptsKey);
      return false;
    }

    await this.redis.incr(attemptsKey);

    const storedOtp = await this.redis.get(key);
    if (!storedOtp || storedOtp !== otp) {
      return false;
    }

    // OTP is valid - delete it (single use)
    await this.redis.del(key);
    await this.redis.del(attemptsKey);
    return true;
  }

  /**
   * Create a reset session token after OTP verification.
   */
  async createResetSession(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const key = `vault-reset:session:${token}`;
    await this.redis.setex(key, this.resetSessionTtl, userId);
    return token;
  }

  /**
   * Validate a reset session token and return the userId.
   */
  async validateResetSession(token: string): Promise<string | null> {
    const key = `vault-reset:session:${token}`;
    return this.redis.get(key);
  }

  /**
   * Consume (delete) a reset session after use.
   */
  async consumeResetSession(token: string): Promise<void> {
    const key = `vault-reset:session:${token}`;
    await this.redis.del(key);
  }

  /**
   * Get OTP TTL in minutes for display purposes.
   */
  getOtpTtlMinutes(): number {
    return Math.floor(this.otpTtl / 60);
  }
}
