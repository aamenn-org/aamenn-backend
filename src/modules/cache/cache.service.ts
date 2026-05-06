import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;
  private readonly env: string;
  private readonly ttls: {
    albums: number;
    files: number;
    storage: number;
    duplicate: number;
  };
  private isHealthy = true;
  private failureCount = 0;
  private readonly MAX_FAILURES = 5;

  constructor(private configService: ConfigService) {
    this.env = this.configService.get<string>('NODE_ENV', 'development');
    this.ttls = {
      albums: this.configService.get<number>('redis.ttl.albums', 60),
      files: this.configService.get<number>('redis.ttl.files', 30),
      storage: this.configService.get<number>('redis.ttl.storage', 60),
      duplicate: this.configService.get<number>('redis.ttl.duplicate', 900),
    };
  }

  async onModuleInit() {
    try {
      this.redis = new Redis({
        host: this.configService.get<string>('redis.host', 'localhost'),
        port: this.configService.get<number>('redis.port', 6379),
        password: this.configService.get<string>('redis.password'),
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.error('Redis connection failed after 3 retries');
            return null;
          }
          return Math.min(times * 200, 2000);
        },
        maxRetriesPerRequest: 3,
      });

      this.redis.on('error', (err: Error) => {
        this.logger.error('Redis error:', err.message);
        this.handleFailure();
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis connected');
        this.isHealthy = true;
        this.failureCount = 0;
      });

      await this.redis.ping();
      this.logger.log('Redis cache service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Redis:', error.message);
      this.isHealthy = false;
    }
  }

  private handleFailure() {
    this.failureCount++;
    if (this.failureCount >= this.MAX_FAILURES) {
      this.isHealthy = false;
      this.logger.warn('Redis marked unhealthy after multiple failures');
    }
  }

  private buildKey(userId: string, type: string, suffix: string): string {
    return `cache:v1:env:${this.env}:u:${userId}:${type}:${suffix}`;
  }

  private buildVersionKey(userId: string, type: string): string {
    return `cache:v1:env:${this.env}:u:${userId}:ver:${type}`;
  }

  async getVersion(userId: string, type: string): Promise<number> {
    if (!this.isHealthy) return 0;
    try {
      const key = this.buildVersionKey(userId, type);
      const version = await this.redis.get(key);
      return version ? parseInt(version, 10) : 0;
    } catch (error) {
      this.logger.warn(`Failed to get version: ${error.message}`);
      this.handleFailure();
      return 0;
    }
  }

  async incrementVersion(userId: string, type: string): Promise<void> {
    if (!this.isHealthy) return;
    try {
      const key = this.buildVersionKey(userId, type);
      await this.redis.incr(key);
    } catch (error) {
      this.logger.warn(`Failed to increment version: ${error.message}`);
      this.handleFailure();
    }
  }

  async get<T>(userId: string, type: string, suffix: string): Promise<T | null> {
    if (!this.isHealthy) return null;
    try {
      const key = this.buildKey(userId, type, suffix);
      const data = await this.redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      this.logger.warn(`Cache get failed: ${error.message}`);
      this.handleFailure();
      return null;
    }
  }

  async set(
    userId: string,
    type: string,
    suffix: string,
    value: any,
    ttlSeconds?: number,
  ): Promise<void> {
    if (!this.isHealthy) return;
    try {
      const key = this.buildKey(userId, type, suffix);
      const serialized = JSON.stringify(value);
      
      if (serialized.length > 64 * 1024) {
        this.logger.warn(`Cache value too large (${serialized.length} bytes), skipping`);
        return;
      }

      const ttl = ttlSeconds || (this.ttls[type as keyof typeof this.ttls] || 60);
      await this.redis.setex(key, ttl, serialized);
    } catch (error) {
      this.logger.warn(`Cache set failed: ${error.message}`);
      this.handleFailure();
    }
  }

  async del(userId: string, type: string, suffix: string): Promise<void> {
    if (!this.isHealthy) return;
    try {
      const key = this.buildKey(userId, type, suffix);
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(`Cache delete failed: ${error.message}`);
      this.handleFailure();
    }
  }

  getHealthStatus(): { healthy: boolean; failures: number } {
    return {
      healthy: this.isHealthy,
      failures: this.failureCount,
    };
  }
}
