import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { User, UserRole } from '../../database/entities/user.entity';
import { File } from '../../database/entities/file.entity';
import { DownloadLog } from '../../database/entities/download-log.entity';
import { AdminUsersQueryDto, UserSortBy } from './dto/admin-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

/**
 * Dashboard Overview Statistics
 */
export interface DashboardStats {
  totalUsers: number;
  activeUsers24h: number;
  activeUsers7d: number;
  newUsersToday: number;
  newUsersWeek: number;
  totalFiles: number;
  totalStorageBytes: number;
  avgFileSize: number;
  uploadsToday: number;
  uploadsWeek: number;
  /**
   * File view statistics - tracks when users request file URLs.
   * Note: This measures URL generation requests, not actual B2 downloads.
   * In a zero-knowledge architecture, we cannot track actual client-side downloads
   * from B2 signed URLs. These metrics represent "file view intents".
   */
  bandwidthToday: number;
  bandwidthMonth: number;
  downloadsToday: number;
  downloadsMonth: number;
}

/**
 * User with storage statistics
 */
export interface UserWithStats {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  fileCount: number;
  storageBytes: number;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  totalFiles: number;
  totalStorageBytes: number;
  avgFileSize: number;
  uploadsToday: number;
  uploadsThisWeek: number;
  uploadsThisMonth: number;
  storageGrowthDaily: number; // bytes per day average
  filesByMimeType: { mimeType: string; count: number; totalBytes: number }[];
  /**
   * File view statistics - tracks when users request file URLs.
   * Note: This measures URL generation requests, not actual B2 downloads.
   */
  bandwidthToday: number;
  bandwidthMonth: number;
  downloadsToday: number;
  downloadsMonth: number;
}

/**
 * System health status
 */
export interface SystemHealth {
  storageUsagePercent: number;
  storageWarning: boolean;
  storageLimit: number;
  storageUsed: number;
  databaseStatus: 'healthy' | 'degraded' | 'error';
  activeUsersLast24h: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  // Configurable limits from environment
  private readonly STORAGE_WARNING_THRESHOLD: number;
  private readonly STORAGE_LIMIT_GB: number;

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(File)
    private filesRepository: Repository<File>,
    @InjectRepository(DownloadLog)
    private downloadLogsRepository: Repository<DownloadLog>,
  ) {
    // B2 free tier is 10GB, can be overridden via env
    this.STORAGE_LIMIT_GB = this.configService.get<number>(
      'B2_STORAGE_LIMIT_GB',
      10,
    );
    this.STORAGE_WARNING_THRESHOLD = this.configService.get<number>(
      'STORAGE_WARNING_THRESHOLD',
      80,
    );
  }

  /**
   * Get bandwidth statistics for a given time period
   */
  private async getBandwidthStats(
    startDate: Date,
  ): Promise<{ totalBytes: number; count: number }> {
    const result = await this.downloadLogsRepository
      .createQueryBuilder('dl')
      .select('COALESCE(SUM(dl.sizeBytes), 0)', 'totalBytes')
      .addSelect('COUNT(*)', 'count')
      .where('dl.createdAt >= :startDate', { startDate })
      .getRawOne();

    return {
      totalBytes: parseInt(result?.totalBytes || '0', 10),
      count: parseInt(result?.count || '0', 10),
    };
  }

  /**
   * Get dashboard overview statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Use UTC for consistent timezone handling
    const startOfTodayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startOfWeekUTC = new Date(
      startOfTodayUTC.getTime() - now.getUTCDay() * 24 * 60 * 60 * 1000,
    );
    const startOfMonthUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    // User statistics
    const [
      totalUsers,
      activeUsers24h,
      activeUsers7d,
      newUsersToday,
      newUsersWeek,
    ] = await Promise.all([
      this.usersRepository.count({ where: { role: UserRole.USER } }),
      this.usersRepository.count({
        where: {
          role: UserRole.USER,
          lastLoginAt: MoreThanOrEqual(oneDayAgo),
        },
      }),
      this.usersRepository.count({
        where: {
          role: UserRole.USER,
          lastLoginAt: MoreThanOrEqual(oneWeekAgo),
        },
      }),
      this.usersRepository.count({
        where: {
          role: UserRole.USER,
          createdAt: MoreThanOrEqual(startOfTodayUTC),
        },
      }),
      this.usersRepository.count({
        where: {
          role: UserRole.USER,
          createdAt: MoreThanOrEqual(startOfWeekUTC),
        },
      }),
    ]);

    // File statistics
    const fileStats = await this.filesRepository
      .createQueryBuilder('file')
      .select('COUNT(*)', 'totalFiles')
      .addSelect('COALESCE(SUM(file.sizeBytes), 0)', 'totalStorageBytes')
      .addSelect('COALESCE(AVG(file.sizeBytes), 0)', 'avgFileSize')
      .where('file.deletedAt IS NULL')
      .getRawOne();

    const uploadsToday = await this.filesRepository.count({
      where: {
        createdAt: MoreThanOrEqual(startOfTodayUTC),
        deletedAt: undefined,
      },
    });

    const uploadsWeek = await this.filesRepository.count({
      where: {
        createdAt: MoreThanOrEqual(startOfWeekUTC),
        deletedAt: undefined,
      },
    });

    // Bandwidth statistics
    const [bandwidthTodayStats, bandwidthMonthStats] = await Promise.all([
      this.getBandwidthStats(startOfTodayUTC),
      this.getBandwidthStats(startOfMonthUTC),
    ]);

    return {
      totalUsers,
      activeUsers24h,
      activeUsers7d,
      newUsersToday,
      newUsersWeek,
      totalFiles: parseInt(fileStats?.totalFiles || '0', 10),
      totalStorageBytes: parseInt(fileStats?.totalStorageBytes || '0', 10),
      avgFileSize: parseFloat(fileStats?.avgFileSize || '0'),
      uploadsToday,
      uploadsWeek,
      bandwidthToday: bandwidthTodayStats.totalBytes,
      bandwidthMonth: bandwidthMonthStats.totalBytes,
      downloadsToday: bandwidthTodayStats.count,
      downloadsMonth: bandwidthMonthStats.count,
    };
  }

  /**
   * Get paginated list of users with their storage stats
   */
  async getUsers(query: AdminUsersQueryDto): Promise<{
    users: UserWithStats[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    // Build base query
    const queryBuilder = this.usersRepository
      .createQueryBuilder('user')
      .leftJoin('user.files', 'file', 'file.deletedAt IS NULL')
      .select([
        'user.id',
        'user.email',
        'user.displayName',
        'user.role',
        'user.isActive',
        'user.createdAt',
        'user.lastLoginAt',
      ])
      .addSelect('COUNT(file.id)', 'fileCount')
      .addSelect('COALESCE(SUM(file.sizeBytes), 0)', 'storageBytes')
      .where('user.role = :role', { role: UserRole.USER })
      .groupBy('user.id')
      .addGroupBy('user.email')
      .addGroupBy('user.displayName')
      .addGroupBy('user.role')
      .addGroupBy('user.isActive')
      .addGroupBy('user.createdAt')
      .addGroupBy('user.lastLoginAt');

    // Add search filter
    if (search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.displayName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Add sorting
    if (sortBy === UserSortBy.STORAGE) {
      queryBuilder.orderBy('"storageBytes"', sortOrder);
    } else if (sortBy === UserSortBy.FILES) {
      queryBuilder.orderBy('"fileCount"', sortOrder);
    } else if (sortBy === UserSortBy.LAST_LOGIN) {
      queryBuilder.orderBy('user.lastLoginAt', sortOrder, 'NULLS LAST');
    } else {
      queryBuilder.orderBy('user.createdAt', sortOrder);
    }

    // Get total count (separate query for accurate count)
    const totalQuery = this.usersRepository
      .createQueryBuilder('user')
      .where('user.role = :role', { role: UserRole.USER });

    if (search) {
      totalQuery.andWhere(
        '(user.email ILIKE :search OR user.displayName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const total = await totalQuery.getCount();

    // Get paginated results
    const rawResults = await queryBuilder
      .offset(skip)
      .limit(limit)
      .getRawMany();

    const users: UserWithStats[] = rawResults.map((row) => ({
      id: row.user_id,
      email: row.user_email,
      displayName: row.user_display_name,
      role: row.user_role,
      isActive: row.user_is_active,
      createdAt: row.user_created_at,
      lastLoginAt: row.user_last_login_at,
      fileCount: parseInt(row.fileCount || '0', 10),
      storageBytes: parseInt(row.storageBytes || '0', 10),
    }));

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }


  /**
   * Update user status (enable/disable)
   */
  async updateUserStatus(
    userId: string,
    dto: UpdateUserStatusDto,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      throw new Error('Cannot modify admin users');
    }

    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;
    }

    return this.usersRepository.save(user);
  }

  /**
   * Get detailed storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    const now = new Date();

    // Use UTC for consistent timezone handling
    const startOfTodayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startOfWeekUTC = new Date(
      startOfTodayUTC.getTime() - now.getUTCDay() * 24 * 60 * 60 * 1000,
    );
    const startOfMonthUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Basic stats
    const basicStats = await this.filesRepository
      .createQueryBuilder('file')
      .select('COUNT(*)', 'totalFiles')
      .addSelect('COALESCE(SUM(file.sizeBytes), 0)', 'totalStorageBytes')
      .addSelect('COALESCE(AVG(file.sizeBytes), 0)', 'avgFileSize')
      .where('file.deletedAt IS NULL')
      .getRawOne();

    // Upload counts
    const [uploadsToday, uploadsThisWeek, uploadsThisMonth] = await Promise.all(
      [
        this.filesRepository.count({
          where: {
            createdAt: MoreThanOrEqual(startOfTodayUTC),
            deletedAt: undefined,
          },
        }),
        this.filesRepository.count({
          where: {
            createdAt: MoreThanOrEqual(startOfWeekUTC),
            deletedAt: undefined,
          },
        }),
        this.filesRepository.count({
          where: {
            createdAt: MoreThanOrEqual(startOfMonthUTC),
            deletedAt: undefined,
          },
        }),
      ],
    );

    // Storage growth (last 30 days)
    const growthStats = await this.filesRepository
      .createQueryBuilder('file')
      .select('COALESCE(SUM(file.sizeBytes), 0)', 'totalBytes')
      .where('file.createdAt >= :date', { date: thirtyDaysAgo })
      .andWhere('file.deletedAt IS NULL')
      .getRawOne();

    const storageGrowthDaily =
      parseInt(growthStats?.totalBytes || '0', 10) / 30;

    // Files by mime type
    const mimeTypeStats = await this.filesRepository
      .createQueryBuilder('file')
      .select('file.mimeType', 'mimeType')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(file.sizeBytes), 0)', 'totalBytes')
      .where('file.deletedAt IS NULL')
      .groupBy('file.mimeType')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // Bandwidth statistics
    const [bandwidthTodayStats, bandwidthMonthStats] = await Promise.all([
      this.getBandwidthStats(startOfTodayUTC),
      this.getBandwidthStats(startOfMonthUTC),
    ]);

    return {
      totalFiles: parseInt(basicStats?.totalFiles || '0', 10),
      totalStorageBytes: parseInt(basicStats?.totalStorageBytes || '0', 10),
      avgFileSize: parseFloat(basicStats?.avgFileSize || '0'),
      uploadsToday,
      uploadsThisWeek,
      uploadsThisMonth,
      storageGrowthDaily,
      filesByMimeType: mimeTypeStats.map((row) => ({
        mimeType: row.mimeType || 'unknown',
        count: parseInt(row.count, 10),
        totalBytes: parseInt(row.totalBytes, 10),
      })),
      bandwidthToday: bandwidthTodayStats.totalBytes,
      bandwidthMonth: bandwidthMonthStats.totalBytes,
      downloadsToday: bandwidthTodayStats.count,
      downloadsMonth: bandwidthMonthStats.count,
    };
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get storage usage
    const storageStats = await this.filesRepository
      .createQueryBuilder('file')
      .select('COALESCE(SUM(file.sizeBytes), 0)', 'totalBytes')
      .where('file.deletedAt IS NULL')
      .getRawOne();

    const storageUsed = parseInt(storageStats?.totalBytes || '0', 10);
    const storageLimit = this.STORAGE_LIMIT_GB * 1024 * 1024 * 1024; // Convert GB to bytes
    const storageUsagePercent = (storageUsed / storageLimit) * 100;
    const storageWarning =
      storageUsagePercent >= this.STORAGE_WARNING_THRESHOLD;

    // Active users
    const activeUsersLast24h = await this.usersRepository.count({
      where: {
        role: UserRole.USER,
        lastLoginAt: MoreThanOrEqual(oneDayAgo),
      },
    });

    // Database health check (simple query)
    let databaseStatus: 'healthy' | 'degraded' | 'error' = 'healthy';
    try {
      await this.usersRepository.query('SELECT 1');
    } catch {
      databaseStatus = 'error';
    }

    return {
      storageUsagePercent,
      storageWarning,
      storageLimit,
      storageUsed,
      databaseStatus,
      activeUsersLast24h,
    };
  }

  /**
   * Get alerts for the admin dashboard
   */
  async getAlerts(): Promise<
    { type: 'warning' | 'error' | 'info'; message: string; timestamp: Date }[]
  > {
    const alerts: {
      type: 'warning' | 'error' | 'info';
      message: string;
      timestamp: Date;
    }[] = [];
    const health = await this.getSystemHealth();

    if (health.storageWarning) {
      alerts.push({
        type: 'warning',
        message: `Storage usage is at ${health.storageUsagePercent.toFixed(1)}% - consider expanding storage`,
        timestamp: new Date(),
      });
    }

    if (health.storageUsagePercent >= 95) {
      alerts.push({
        type: 'error',
        message: `Critical: Storage is nearly full (${health.storageUsagePercent.toFixed(1)}%)`,
        timestamp: new Date(),
      });
    }

    if (health.databaseStatus !== 'healthy') {
      alerts.push({
        type: 'error',
        message: `Database status: ${health.databaseStatus}`,
        timestamp: new Date(),
      });
    }

    return alerts;
  }
}
