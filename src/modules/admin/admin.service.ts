import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { User, UserRole } from '../../database/entities/user.entity';
import { File } from '../../database/entities/file.entity';
import { DownloadLog } from '../../database/entities/download-log.entity';
import { AdminUsersQueryDto, UserSortBy } from './dto/admin-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { B2StorageService } from '../storage/b2-storage.service';

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
  storageLimitGb: number;
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
  b2StorageStatus: 'healthy' | 'degraded' | 'error';
  b2StorageMessage: string;
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
    private b2StorageService: B2StorageService,
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

    // File statistics (exclude avatar files, include trashed files in storage)
    const fileStats = await this.filesRepository
      .createQueryBuilder('file')
      .select('COUNT(CASE WHEN file.deletedAt IS NULL THEN 1 END)', 'totalFiles')
      .addSelect('COALESCE(SUM(file.sizeBytes), 0)', 'totalStorageBytes')
      .addSelect('COALESCE(AVG(CASE WHEN file.deletedAt IS NULL THEN file.sizeBytes END), 0)', 'avgFileSize')
      .where('file.isAvatar = :isAvatar', { isAvatar: false })
      .withDeleted()
      .getRawOne();

    const uploadsToday = await this.filesRepository.count({
      where: {
        createdAt: MoreThanOrEqual(startOfTodayUTC),
        deletedAt: undefined,
        isAvatar: false,
      },
    });

    const uploadsWeek = await this.filesRepository.count({
      where: {
        createdAt: MoreThanOrEqual(startOfWeekUTC),
        deletedAt: undefined,
        isAvatar: false,
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

    // Determine ORDER BY clause
    let orderClause: string;
    const dir = sortOrder === 'ASC' ? 'ASC' : 'DESC';
    if (sortBy === UserSortBy.STORAGE) {
      orderClause = `storage_bytes ${dir}`;
    } else if (sortBy === UserSortBy.FILES) {
      orderClause = `file_count ${dir}`;
    } else if (sortBy === UserSortBy.LAST_LOGIN) {
      orderClause = `u.last_login_at ${dir} NULLS LAST`;
    } else {
      orderClause = `u.created_at ${dir}`;
    }

    // Build search condition
    const searchCondition = search
      ? `AND (u.email ILIKE $2 OR u.display_name ILIKE $2)`
      : '';
    const params: (string | number)[] = [UserRole.USER];
    if (search) params.push(`%${search}%`);

    // Count query
    const countSql = `
      SELECT COUNT(*) AS total
      FROM users u
      WHERE u.role = $1
      ${searchCondition}
    `;
    const countResult = await this.usersRepository.query(countSql, params);
    const total = parseInt(countResult[0]?.total || '0', 10);

    // Data query — LEFT JOIN raw files table (no soft-delete filter) so trashed files
    // are included in storage_bytes; file_count only counts active (deleted_at IS NULL) files
    const dataSql = `
      SELECT
        u.id,
        u.email,
        u.display_name       AS "displayName",
        u.role,
        u.is_active          AS "isActive",
        u.created_at         AS "createdAt",
        u.last_login_at      AS "lastLoginAt",
        u.storage_limit_gb   AS "storageLimitGb",
        COUNT(CASE WHEN f.deleted_at IS NULL AND f.is_avatar = FALSE THEN f.id END)::int AS file_count,
        COALESCE(SUM(CASE WHEN f.is_avatar = FALSE THEN f.size_bytes END), 0)::bigint    AS storage_bytes
      FROM users u
      LEFT JOIN files f ON f.user_id = u.id
      WHERE u.role = $1
      ${searchCondition}
      GROUP BY u.id, u.email, u.display_name, u.role, u.is_active,
               u.created_at, u.last_login_at, u.storage_limit_gb
      ORDER BY ${orderClause}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, skip);

    const rawResults = await this.usersRepository.query(dataSql, params);

    const users: UserWithStats[] = rawResults.map((row: Record<string, any>) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
      fileCount: parseInt(row.file_count ?? '0', 10),
      storageBytes: parseInt(row.storage_bytes ?? '0', 10),
      storageLimitGb: parseInt(row.storageLimitGb ?? '5', 10),
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
   * Set per-user storage limit (1–1024 GB).
   * Only regular users can be updated.
   */
  async setUserStorageLimit(
    userId: string,
    storageLimitGb: number,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      throw new Error('Cannot modify admin users');
    }

    user.storageLimitGb = storageLimitGb;
    return this.usersRepository.save(user);
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
   * Permanently delete a user and ALL their data.
   * Deletes all B2 files first, then removes the user record.
   * DB cascades handle: files, albums, album_files, download_logs, refresh_tokens, user_security, share_links.
   * Only regular users (role = 'user') can be deleted.
   */
  async deleteUser(userId: string): Promise<{ deletedFiles: number }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      throw new Error('Cannot delete admin users');
    }

    // Fetch ALL files (including trashed) to delete from B2
    const files = await this.filesRepository
      .createQueryBuilder('file')
      .where('file.userId = :userId', { userId })
      .withDeleted()
      .getMany();

    // Delete all files from B2 in parallel (main + all thumbnails)
    await Promise.all(
      files.map(async (file) => {
        try {
          await this.b2StorageService.deleteFiles([
            file.b2FilePath,
            file.b2ThumbSmallPath,
            file.b2ThumbMediumPath,
            file.b2ThumbLargePath,
          ]);
        } catch (error) {
          this.logger.error(
            `Failed to delete B2 file ${file.id} for user ${userId}`,
            error,
          );
          // Continue — don't block user deletion if B2 fails
        }
      }),
    );

    // Delete user — DB CASCADE handles all related records
    await this.usersRepository.remove(user);

    this.logger.log(
      `Admin deleted user ${userId} (${user.email}) with ${files.length} files`,
    );

    return { deletedFiles: files.length };
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

    // Basic stats (exclude avatar files, include trashed files in storage)
    const basicStats = await this.filesRepository
      .createQueryBuilder('file')
      .select('COUNT(CASE WHEN file.deletedAt IS NULL THEN 1 END)', 'totalFiles')
      .addSelect('COALESCE(SUM(file.sizeBytes), 0)', 'totalStorageBytes')
      .addSelect('COALESCE(AVG(CASE WHEN file.deletedAt IS NULL THEN file.sizeBytes END), 0)', 'avgFileSize')
      .where('file.isAvatar = :isAvatar', { isAvatar: false })
      .withDeleted()
      .getRawOne();

    // Upload counts
    const [uploadsToday, uploadsThisWeek, uploadsThisMonth] = await Promise.all(
      [
        this.filesRepository.count({
          where: {
            createdAt: MoreThanOrEqual(startOfTodayUTC),
            deletedAt: undefined,
            isAvatar: false,
          },
        }),
        this.filesRepository.count({
          where: {
            createdAt: MoreThanOrEqual(startOfWeekUTC),
            deletedAt: undefined,
            isAvatar: false,
          },
        }),
        this.filesRepository.count({
          where: {
            createdAt: MoreThanOrEqual(startOfMonthUTC),
            deletedAt: undefined,
            isAvatar: false,
          },
        }),
      ],
    );

    // Storage growth (last 30 days, exclude avatars, include trashed files)
    const growthStats = await this.filesRepository
      .createQueryBuilder('file')
      .select('COALESCE(SUM(file.sizeBytes), 0)', 'totalBytes')
      .where('file.createdAt >= :date', { date: thirtyDaysAgo })
      .andWhere('file.isAvatar = :isAvatar', { isAvatar: false })
      .withDeleted()
      .getRawOne();

    const storageGrowthDaily =
      parseInt(growthStats?.totalBytes || '0', 10) / 30;

    // Files by mime type (exclude avatars, include trashed files in storage)
    const mimeTypeStats = await this.filesRepository
      .createQueryBuilder('file')
      .select('file.mimeType', 'mimeType')
      .addSelect('COUNT(CASE WHEN file.deletedAt IS NULL THEN 1 END)', 'count')
      .addSelect('COALESCE(SUM(file.sizeBytes), 0)', 'totalBytes')
      .where('file.isAvatar = :isAvatar', { isAvatar: false })
      .withDeleted()
      .groupBy('file.mimeType')
      .orderBy('totalBytes', 'DESC')
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

    // Get storage usage (exclude avatar files, include trashed files)
    const storageStats = await this.filesRepository
      .createQueryBuilder('file')
      .select('COALESCE(SUM(file.sizeBytes), 0)', 'totalBytes')
      .where('file.isAvatar = :isAvatar', { isAvatar: false })
      .withDeleted()
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

    // B2 storage health check
    const b2Health = await this.b2StorageService.healthCheck();

    return {
      storageUsagePercent,
      storageWarning,
      storageLimit,
      storageUsed,
      databaseStatus,
      b2StorageStatus: b2Health.status,
      b2StorageMessage: b2Health.message,
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

    if (health.b2StorageStatus === 'error') {
      alerts.push({
        type: 'error',
        message: `B2 Storage error: ${health.b2StorageMessage}`,
        timestamp: new Date(),
      });
    } else if (health.b2StorageStatus === 'degraded') {
      alerts.push({
        type: 'warning',
        message: `B2 Storage degraded: ${health.b2StorageMessage}`,
        timestamp: new Date(),
      });
    }

    return alerts;
  }
}
