import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User } from '../../database/entities/user.entity';

/**
 * Detects multi-account abuse patterns based on device fingerprint,
 * IP address, and account creation proximity.
 *
 * Scoring:
 *  - Same fingerprint alone  → flag for admin review
 *  - Same fingerprint + same /24 IP subnet + created within 1 hour → auto-deactivate
 */
@Injectable()
export class SignupAbuseService {
  private readonly logger = new Logger(SignupAbuseService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /**
   * Run after successful registration (non-blocking).
   * Returns whether the account was flagged or blocked.
   */
  async checkSignupAnomaly(
    userId: string,
    ip: string,
    fingerprint?: string,
  ): Promise<{ flagged: boolean; blocked: boolean }> {
    if (!fingerprint) {
      return { flagged: false, blocked: false };
    }

    try {
      // Find users with the same fingerprint created in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const matchingUsers = await this.usersRepository.find({
        where: {
          signupFingerprint: fingerprint,
          createdAt: MoreThan(thirtyDaysAgo),
        },
        select: ['id', 'signupIp', 'createdAt', 'signupFlagged', 'isActive'],
      });

      // Exclude the current user from matches
      const otherMatches = matchingUsers.filter((u) => u.id !== userId);

      if (otherMatches.length === 0) {
        return { flagged: false, blocked: false };
      }

      // Flag the current user and all matching users
      this.logger.warn(
        `Duplicate fingerprint detected for user ${userId}: ` +
          `${otherMatches.length} other account(s) with same fingerprint`,
      );

      const allIds = [userId, ...otherMatches.map((u) => u.id)];
      await this.usersRepository
        .createQueryBuilder()
        .update(User)
        .set({ signupFlagged: true })
        .whereInIds(allIds)
        .execute();

      // Check for auto-block: same /24 subnet + created within 1 hour
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const currentSubnet = this.getIpSubnet(ip);

      const recentSameSubnet = otherMatches.filter((u) => {
        const matchSubnet = this.getIpSubnet(u.signupIp || '');
        const createdRecently = u.createdAt > oneHourAgo;
        return matchSubnet === currentSubnet && createdRecently;
      });

      if (recentSameSubnet.length > 0) {
        this.logger.warn(
          `Auto-deactivating user ${userId}: same fingerprint + same /24 subnet ` +
            `(${currentSubnet}) + created within 1 hour of ${recentSameSubnet.length} other account(s)`,
        );

        await this.usersRepository.update(userId, { isActive: false });
        return { flagged: true, blocked: true };
      }

      return { flagged: true, blocked: false };
    } catch (error) {
      // Never let abuse detection break registration
      this.logger.error('SignupAbuseService error:', error.message);
      return { flagged: false, blocked: false };
    }
  }

  /**
   * Extract /24 subnet from an IP (first 3 octets for IPv4).
   * For IPv6, uses the first 48 bits.
   */
  private getIpSubnet(ip: string): string {
    if (!ip) return '';

    // IPv4
    const parts = ip.split('.');
    if (parts.length === 4) {
      return parts.slice(0, 3).join('.');
    }

    // IPv6: use first 3 groups
    const v6parts = ip.split(':');
    if (v6parts.length >= 3) {
      return v6parts.slice(0, 3).join(':');
    }

    return ip;
  }

  /**
   * Get flagged signups for admin review.
   */
  async getFlaggedSignups(): Promise<
    Pick<User, 'id' | 'email' | 'signupIp' | 'signupFingerprint' | 'signupIpType' | 'createdAt' | 'isActive'>[]
  > {
    return this.usersRepository.find({
      where: { signupFlagged: true },
      select: ['id', 'email', 'signupIp', 'signupFingerprint', 'signupIpType', 'createdAt', 'isActive'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
