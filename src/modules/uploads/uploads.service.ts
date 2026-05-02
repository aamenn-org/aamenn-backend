import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  PayloadTooLargeException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UploadSession,
  CompletedPart,
} from '../../database/entities/upload-session.entity';
import { File } from '../../database/entities/file.entity';
import { User } from '../../database/entities/user.entity';
import { B2StorageService } from '../storage/b2-storage.service';
import { CacheService } from '../cache/cache.service';
import { StartUploadDto } from './dto/start-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import * as crypto from 'crypto';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @InjectRepository(UploadSession)
    private readonly sessionsRepo: Repository<UploadSession>,
    @InjectRepository(File)
    private readonly filesRepo: Repository<File>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly b2: B2StorageService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Start a new chunked upload session.
   * Creates a B2 large file and a local UploadSession record.
   */
  async startUpload(userId: string, dto: StartUploadDto) {
    // Enforce per-user storage limit before initiating upload
    const [storageResult, user] = await Promise.all([
      this.filesRepo
        .createQueryBuilder('file')
        .select('COALESCE(SUM(file.sizeBytes), 0)', 'totalBytes')
        .where('file.userId = :userId', { userId })
        .withDeleted()
        .getRawOne<{ totalBytes: string }>(),
      this.usersRepo.findOne({
        where: { id: userId },
        select: ['storageLimitGb'],
      }),
    ]);

    const usedBytes = parseInt(storageResult?.totalBytes ?? '0', 10);
    const limitGb = user?.storageLimitGb ?? 4;
    const limitBytes = limitGb * 1024 * 1024 * 1024;

    if (usedBytes + dto.totalBytes > limitBytes) {
      const remainingBytes = Math.max(0, limitBytes - usedBytes);
      throw new PayloadTooLargeException(
        `Storage limit exceeded. Your limit is ${limitGb} GB. ` +
          `You have ${(remainingBytes / (1024 * 1024 * 1024)).toFixed(2)} GB remaining.`,
      );
    }

    const b2FilePath = this.b2.generateFilePath(userId);

    const { fileId: b2FileId } = await this.b2.startLargeFile(b2FilePath);

    const session = this.sessionsRepo.create({
      userId,
      b2FileId,
      b2FilePath,
      fileNameEncrypted: dto.fileNameEncrypted,
      cipherFileKey: dto.cipherFileKey,
      mimeType: dto.mimeType || null,
      totalBytes: dto.totalBytes,
      totalParts: dto.totalParts,
      chunkSizeBytes: dto.chunkSizeBytes,
      completedParts: [],
      status: 'active',
      contentHash: dto.contentHash || null,
      folderId: dto.folderId || null,
      width: dto.width ?? null,
      height: dto.height ?? null,
      duration: dto.duration ?? null,
    });

    await this.sessionsRepo.save(session);

    this.logger.log(
      `Started upload session ${session.id} for user ${userId} (b2FileId=${b2FileId}, parts=${dto.totalParts})`,
    );

    return {
      uploadId: session.id,
      b2FileId: session.b2FileId,
      b2FilePath: session.b2FilePath,
    };
  }

  /**
   * Get one or more signed part upload URLs for a session.
   * Each URL is single-use for one parallel upload slot.
   */
  async getPartUrls(userId: string, uploadId: string, count: number) {
    if (count < 1 || count > 10) {
      throw new BadRequestException('Count must be between 1 and 10');
    }

    const session = await this.getActiveSession(userId, uploadId);
    const urls = await this.b2.getUploadPartUrls(session.b2FileId, count);

    return {
      urls: urls.map((u) => ({
        uploadUrl: u.uploadUrl,
        authorizationToken: u.authorizationToken,
      })),
    };
  }

  /**
   * Record that a part has been successfully uploaded.
   * Called by the client after each direct-to-B2 chunk upload.
   */
  async recordPart(
    userId: string,
    uploadId: string,
    partNumber: number,
    sha1: string,
  ) {
    if (partNumber < 1 || partNumber > 10000) {
      throw new BadRequestException('Part number must be between 1 and 10000');
    }

    const session = await this.getActiveSession(userId, uploadId);

    const alreadyExists = session.completedParts.some(
      (p) => p.partNumber === partNumber,
    );
    if (alreadyExists) {
      return { recorded: true, duplicate: true };
    }

    const updatedParts: CompletedPart[] = [
      ...session.completedParts,
      { partNumber, sha1 },
    ];

    await this.sessionsRepo.update(
      { id: uploadId },
      { completedParts: updatedParts },
    );

    return { recorded: true, duplicate: false };
  }

  /**
   * Complete a chunked upload: finish the B2 large file and create the File entity.
   * Optionally accepts encrypted thumbnail data to upload via the proxy path.
   */
  async completeUpload(
    userId: string,
    uploadId: string,
    dto: CompleteUploadDto,
  ) {
    const session = await this.getActiveSession(userId, uploadId);

    if (dto.partSha1Array.length !== session.totalParts) {
      throw new BadRequestException(
        `Expected ${session.totalParts} part hashes, got ${dto.partSha1Array.length}`,
      );
    }

    await this.b2.finishLargeFile(session.b2FileId, dto.partSha1Array);

    let thumbSmallPath: string | null = null;
    let thumbMediumPath: string | null = null;
    let thumbLargePath: string | null = null;

    if (dto.thumbSmall && dto.thumbMedium && dto.thumbLarge) {
      thumbSmallPath = this.b2.generateFilePath(userId, 'thumb-small');
      thumbMediumPath = this.b2.generateFilePath(userId, 'thumb-medium');
      thumbLargePath = this.b2.generateFilePath(userId, 'thumb-large');

      const thumbSmallBuf = Buffer.from(dto.thumbSmall, 'base64');
      const thumbMediumBuf = Buffer.from(dto.thumbMedium, 'base64');
      const thumbLargeBuf = Buffer.from(dto.thumbLarge, 'base64');

      const [thumbSmallHash, thumbMediumHash, thumbLargeHash] = [
        crypto.createHash('sha1').update(thumbSmallBuf).digest('hex'),
        crypto.createHash('sha1').update(thumbMediumBuf).digest('hex'),
        crypto.createHash('sha1').update(thumbLargeBuf).digest('hex'),
      ];

      await Promise.all([
        this.b2.uploadFile(thumbSmallPath, thumbSmallBuf, thumbSmallHash),
        this.b2.uploadFile(thumbMediumPath, thumbMediumBuf, thumbMediumHash),
        this.b2.uploadFile(thumbLargePath, thumbLargeBuf, thumbLargeHash),
      ]);
    }

    const file = this.filesRepo.create({
      userId,
      b2FilePath: session.b2FilePath,
      cipherFileKey: session.cipherFileKey,
      fileNameEncrypted: session.fileNameEncrypted,
      mimeType: session.mimeType,
      sizeBytes: session.totalBytes,
      contentHash: session.contentHash,
      folderId: session.folderId,
      width: session.width,
      height: session.height,
      duration: session.duration,
      b2ThumbSmallPath: thumbSmallPath,
      b2ThumbMediumPath: thumbMediumPath,
      b2ThumbLargePath: thumbLargePath,
    });

    await this.filesRepo.save(file);

    session.status = 'completed';
    await this.sessionsRepo.save(session);

    await this.cacheService.incrementVersion(userId, 'files');

    let thumbSmallUrl: string | null = null;
    let thumbMediumUrl: string | null = null;
    let thumbLargeUrl: string | null = null;

    if (thumbSmallPath && thumbMediumPath && thumbLargePath) {
      const [s, m, l] = await Promise.all([
        this.b2.getSignedDownloadUrl(thumbSmallPath),
        this.b2.getSignedDownloadUrl(thumbMediumPath),
        this.b2.getSignedDownloadUrl(thumbLargePath),
      ]);
      thumbSmallUrl = s.downloadUrl;
      thumbMediumUrl = m.downloadUrl;
      thumbLargeUrl = l.downloadUrl;
    }

    this.logger.log(`Completed upload session ${uploadId} → file ${file.id}`);

    return {
      fileId: file.id,
      b2FilePath: file.b2FilePath,
      cipherFileKey: file.cipherFileKey,
      fileNameEncrypted: file.fileNameEncrypted,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      folderId: file.folderId,
      width: file.width,
      height: file.height,
      duration: file.duration,
      thumbSmallUrl,
      thumbMediumUrl,
      thumbLargeUrl,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  /**
   * Cancel an in-progress upload session. Cleans up B2 partial data.
   */
  async cancelUpload(userId: string, uploadId: string) {
    const session = await this.sessionsRepo.findOne({
      where: { id: uploadId, userId },
    });

    if (!session) {
      throw new NotFoundException('Upload session not found');
    }

    if (session.status !== 'active') {
      return { success: true, message: `Session already ${session.status}` };
    }

    try {
      await this.b2.cancelLargeFile(session.b2FileId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to cancel B2 file ${session.b2FileId}: ${msg}`);
    }

    session.status = 'cancelled';
    await this.sessionsRepo.save(session);

    this.logger.log(`Cancelled upload session ${uploadId}`);
    return { success: true };
  }

  /**
   * Get the current status of an upload session, reconciled with B2.
   */
  async getSessionStatus(userId: string, uploadId: string) {
    const session = await this.sessionsRepo.findOne({
      where: { id: uploadId, userId },
    });

    if (!session) {
      throw new NotFoundException('Upload session not found');
    }

    if (session.status === 'active') {
      try {
        const b2Parts = await this.b2.listParts(session.b2FileId);
        session.completedParts = b2Parts.parts.map((p) => ({
          partNumber: p.partNumber,
          sha1: p.contentSha1,
        }));
        await this.sessionsRepo.save(session);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('404') || msg.includes('not found')) {
          session.status = 'expired';
          await this.sessionsRepo.save(session);
        }
      }
    }

    return {
      id: session.id,
      status: session.status,
      b2FileId: session.b2FileId,
      totalParts: session.totalParts,
      completedParts: session.completedParts,
      totalBytes: session.totalBytes,
      chunkSizeBytes: session.chunkSizeBytes,
      fileName: session.fileNameEncrypted,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  /**
   * List all active (pending) upload sessions for a user.
   */
  async listPendingSessions(userId: string) {
    const sessions = await this.sessionsRepo.find({
      where: { userId, status: 'active' },
      order: { createdAt: 'DESC' },
    });

    return sessions.map((s) => ({
      id: s.id,
      b2FileId: s.b2FileId,
      fileNameEncrypted: s.fileNameEncrypted,
      mimeType: s.mimeType,
      totalBytes: s.totalBytes,
      totalParts: s.totalParts,
      chunkSizeBytes: s.chunkSizeBytes,
      completedPartsCount: s.completedParts.length,
      contentHash: s.contentHash,
      folderId: s.folderId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  /**
   * Find and expire stale upload sessions (older than maxAgeMs).
   * Called by the cleanup cron job.
   */
  async expireStaleSessions(maxAgeMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);

    const stale = await this.sessionsRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'active' })
      .andWhere('s.updated_at < :cutoff', { cutoff })
      .getMany();

    let cancelled = 0;
    for (const session of stale) {
      try {
        await this.b2.cancelLargeFile(session.b2FileId);
      } catch {
        // B2 may have already cleaned it
      }
      session.status = 'expired';
      await this.sessionsRepo.save(session);
      cancelled++;
    }

    return cancelled;
  }

  /**
   * Delete all upload session records for a user (used on account deletion).
   */
  async deleteAllForUser(userId: string): Promise<void> {
    const active = await this.sessionsRepo.find({
      where: { userId, status: 'active' },
    });

    for (const session of active) {
      try {
        await this.b2.cancelLargeFile(session.b2FileId);
      } catch {
        // Best effort
      }
    }

    await this.sessionsRepo.delete({ userId });
  }

  // ==================== Private Helpers ====================

  private async getActiveSession(
    userId: string,
    uploadId: string,
  ): Promise<UploadSession> {
    const session = await this.sessionsRepo.findOne({
      where: { id: uploadId, userId, status: 'active' },
    });

    if (!session) {
      throw new NotFoundException('Active upload session not found');
    }

    return session;
  }
}
