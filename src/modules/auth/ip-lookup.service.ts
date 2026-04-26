import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export type IpType = 'residential' | 'datacenter' | 'vpn' | 'unknown';

export interface IpLookupResult {
  ipType: IpType;
  isp: string;
  org: string;
}

interface IpApiResponse {
  proxy?: boolean;
  hosting?: boolean;
  isp?: string;
  org?: string;
}

const CACHE_KEY_PREFIX = 'ip-type:';
const CACHE_TTL_SECONDS = 86400; // 24 hours

/**
 * IP type lookup service using ip-api.com (free, no API key).
 * Caches results in Redis for 24h to stay within rate limits (45 req/min).
 * Fails open to 'unknown' on any error.
 */
@Injectable()
export class IpLookupService {
  private readonly logger = new Logger(IpLookupService.name);
  private readonly enabled: boolean;
  private redis: Redis;

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      this.configService.get<string>('IP_LOOKUP_ENABLED', 'true') !== 'false';

    const redisHost = this.configService.get<string>('redis.host', 'localhost');
    const redisPort = this.configService.get<number>('redis.port', 6379);
    const redisPassword = this.configService.get<string>('redis.password');

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      maxRetriesPerRequest: 3,
    });
  }

  async lookupIp(ip: string): Promise<IpLookupResult> {
    const unknown: IpLookupResult = { ipType: 'unknown', isp: '', org: '' };

    if (!this.enabled || !ip || ip === 'unknown') {
      return unknown;
    }

    // Check Redis cache first
    try {
      const cached = await this.redis.get(`${CACHE_KEY_PREFIX}${ip}`);
      if (cached) {
        return JSON.parse(cached) as IpLookupResult;
      }
    } catch (err) {
      this.logger.warn(`Redis cache read failed for IP ${ip}: ${err.message}`);
    }

    // Query ip-api.com
    try {
      const response = await fetch(
        `http://ip-api.com/json/${ip}?fields=proxy,hosting,isp,org`,
        { signal: AbortSignal.timeout(3000) },
      );

      if (!response.ok) {
        this.logger.warn(`ip-api.com returned status ${response.status} for IP ${ip}`);
        return unknown;
      }

      const data: IpApiResponse = await response.json();

      let ipType: IpType = 'residential';
      if (data.hosting) {
        ipType = 'datacenter';
      } else if (data.proxy) {
        ipType = 'vpn';
      }

      const result: IpLookupResult = {
        ipType,
        isp: data.isp || '',
        org: data.org || '',
      };

      // Cache in Redis for 24h
      try {
        await this.redis.setex(
          `${CACHE_KEY_PREFIX}${ip}`,
          CACHE_TTL_SECONDS,
          JSON.stringify(result),
        );
      } catch (err) {
        this.logger.warn(`Redis cache write failed for IP ${ip}: ${err.message}`);
      }

      return result;
    } catch (error) {
      this.logger.warn(`IP lookup failed for ${ip}: ${error.message}`);
      return unknown;
    }
  }
}
