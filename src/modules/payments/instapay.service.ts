import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import {
  InstapayPayment,
  InstapayPaymentStatus,
} from '../../database/entities/instapay-payment.entity';
import { Plan } from '../../database/entities/plan.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import { User } from '../../database/entities/user.entity';
import { PaymentsService } from './payments.service';
import { MailService } from '../mail/mail.service';
import { B2StorageService } from '../storage/b2-storage.service';
import { InstapayReviewAction } from './dto/review-instapay.dto';

export interface InstapayInfo {
  enabled: boolean;
  username: string | null;
  qrImageUrl: string | null;
}

export interface InstapaySubmissionView extends Omit<
  InstapayPayment,
  'screenshotB2Path'
> {
  screenshotUrl: string | null;
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_MIME = /^image\/(png|jpe?g)$/i;

@Injectable()
export class InstapayService {
  private readonly logger = new Logger(InstapayService.name);
  private readonly staleHours: number;

  constructor(
    @InjectRepository(InstapayPayment)
    private readonly instapayRepo: Repository<InstapayPayment>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly paymentsService: PaymentsService,
    private readonly mailService: MailService,
    private readonly b2StorageService: B2StorageService,
    private readonly configService: ConfigService,
  ) {
    this.staleHours = this.configService.get<number>('instapay.staleHours', 48);
  }

  // ─── Public configuration ──────────────────────────────────────────

  async getInfo(): Promise<InstapayInfo> {
    const enabled =
      this.configService.get<string>('instapay.enabled', 'false') === 'true';
    const username =
      this.configService.get<string>('instapay.username') || null;
    const qrImageUrl =
      this.configService.get<string>('instapay.qrImageUrl') || null;

    return { enabled, username, qrImageUrl };
  }

  // ─── User submission ───────────────────────────────────────────────

  async submitPayment(
    userId: string,
    planId: string,
    file: { buffer: Buffer; size: number; mimetype: string },
    instapayReference: string,
    senderName?: string,
  ): Promise<InstapayPayment> {
    const info = await this.getInfo();
    if (!info.enabled) {
      throw new BadRequestException('InstaPay payments are currently disabled');
    }

    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('Screenshot file is required');
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      throw new BadRequestException('Screenshot must be 5 MB or smaller');
    }
    if (!ALLOWED_SCREENSHOT_MIME.test(file.mimetype)) {
      throw new BadRequestException('Screenshot must be a PNG or JPEG image');
    }

    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      throw new BadRequestException('Plan not found or inactive');
    }

    const existingPending = await this.instapayRepo.findOne({
      where: {
        userId,
        status: InstapayPaymentStatus.PENDING_VERIFICATION,
      },
    });
    if (existingPending) {
      throw new ConflictException(
        'You already have a pending InstaPay submission. Please wait for review.',
      );
    }

    // Upload screenshot directly to B2.
    const sha1Hash = crypto
      .createHash('sha1')
      .update(file.buffer)
      .digest('hex');
    const b2Path = this.b2StorageService.generateFilePath(
      userId,
      'instapay-screenshot',
    );
    await this.b2StorageService.uploadFile(b2Path, file.buffer, sha1Hash);

    const submission = this.instapayRepo.create({
      userId,
      planId: plan.id,
      amountPiasters: plan.pricePiasters,
      status: InstapayPaymentStatus.PENDING_VERIFICATION,
      screenshotB2Path: b2Path,
      screenshotMimeType: file.mimetype,
      instapayReference: instapayReference.trim(),
      senderName: senderName?.trim() || null,
    });

    const saved = await this.instapayRepo.save(submission);
    this.logger.log(
      `InstaPay submission ${saved.id} created for user ${userId}, plan ${plan.name}`,
    );

    // Best-effort cleanup: remove any prior rejected/expired screenshot for this user.
    void this.cleanupPriorScreenshots(userId, saved.id);

    return saved;
  }

  private async cleanupPriorScreenshots(
    userId: string,
    keepId: string,
  ): Promise<void> {
    try {
      const stale = await this.instapayRepo
        .createQueryBuilder('ip')
        .where('ip.user_id = :userId', { userId })
        .andWhere('ip.id != :keepId', { keepId })
        .andWhere('ip.status IN (:...statuses)', {
          statuses: [
            InstapayPaymentStatus.REJECTED,
            InstapayPaymentStatus.EXPIRED,
          ],
        })
        .andWhere('ip.screenshot_b2_path IS NOT NULL')
        .getMany();
      for (const row of stale) {
        if (row.screenshotB2Path) {
          await this.b2StorageService
            .deleteFiles(row.screenshotB2Path)
            .catch((err) =>
              this.logger.warn(
                `Failed to delete stale InstaPay screenshot ${row.screenshotB2Path}: ${(err as Error).message}`,
              ),
            );
          row.screenshotB2Path = null;
          await this.instapayRepo.save(row);
        }
      }
    } catch (err) {
      this.logger.warn(
        `cleanupPriorScreenshots failed for user ${userId}: ${(err as Error).message}`,
      );
    }
  }

  // ─── User status ───────────────────────────────────────────────────

  async getUserLatestSubmission(
    userId: string,
  ): Promise<InstapayPayment | null> {
    return this.instapayRepo.findOne({
      where: { userId },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Admin queries ─────────────────────────────────────────────────

  async getPendingPayments(): Promise<InstapayPayment[]> {
    return this.instapayRepo.find({
      where: { status: InstapayPaymentStatus.PENDING_VERIFICATION },
      relations: ['user', 'plan'],
      order: { createdAt: 'ASC' },
    });
  }

  async getReviewedHistory(limit = 100): Promise<InstapayPayment[]> {
    return this.instapayRepo
      .createQueryBuilder('ip')
      .leftJoinAndSelect('ip.user', 'user')
      .leftJoinAndSelect('ip.plan', 'plan')
      .leftJoinAndSelect('ip.reviewer', 'reviewer')
      .where('ip.status != :pending', {
        pending: InstapayPaymentStatus.PENDING_VERIFICATION,
      })
      .orderBy('ip.reviewedAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  async getPendingCount(): Promise<number> {
    return this.instapayRepo.count({
      where: { status: InstapayPaymentStatus.PENDING_VERIFICATION },
    });
  }

  async getById(id: string): Promise<InstapayPayment> {
    const submission = await this.instapayRepo.findOne({
      where: { id },
      relations: ['user', 'plan', 'reviewer'],
    });
    if (!submission) {
      throw new NotFoundException('InstaPay submission not found');
    }
    return submission;
  }

  /**
   * Returns a submission with a freshly minted short-lived B2 download URL
   * (when the screenshot still exists), and without the raw B2 path.
   */
  async getDetailedView(id: string): Promise<InstapaySubmissionView> {
    const submission = await this.getById(id);
    let screenshotUrl: string | null = null;
    if (submission.screenshotB2Path) {
      try {
        const { downloadUrl } =
          await this.b2StorageService.getSignedDownloadUrl(
            submission.screenshotB2Path,
          );
        screenshotUrl = downloadUrl;
      } catch (err) {
        this.logger.warn(
          `Failed to mint signed URL for InstaPay submission ${id}: ${(err as Error).message}`,
        );
      }
    }
    const { screenshotB2Path: _omit, ...rest } = submission;
    return { ...rest, screenshotUrl } as InstapaySubmissionView;
  }

  // ─── Admin review ──────────────────────────────────────────────────

  async reviewPayment(
    submissionId: string,
    adminUserId: string,
    action: InstapayReviewAction,
    adminNote?: string,
  ): Promise<InstapayPayment> {
    const submission = await this.instapayRepo.findOne({
      where: { id: submissionId },
      relations: ['plan', 'user'],
    });
    if (!submission) {
      throw new NotFoundException('InstaPay submission not found');
    }

    if (submission.status !== InstapayPaymentStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException(
        `Submission already reviewed (status: ${submission.status})`,
      );
    }

    if (action === InstapayReviewAction.APPROVE) {
      await this.approve(submission, adminUserId, adminNote);
    } else {
      await this.reject(submission, adminUserId, adminNote);
    }

    return this.getById(submission.id);
  }

  private async approve(
    submission: InstapayPayment,
    adminUserId: string,
    adminNote?: string,
  ): Promise<void> {
    // Create a successful Payment record so the user's payment history
    // and subscription provenance stay consistent across providers.
    const payment = this.paymentRepo.create({
      userId: submission.userId,
      planId: submission.planId,
      amountPiasters: submission.amountPiasters,
      currency: 'EGP',
      status: PaymentStatus.SUCCESS,
      paymentMethod: `instapay:${submission.instapayReference}`,
      paidAt: new Date(),
    });
    const savedPayment = await this.paymentRepo.save(payment);

    // Hydrate plan relation for activation helper
    savedPayment.plan = submission.plan;

    await this.paymentsService.activateSubscription(savedPayment);

    submission.status = InstapayPaymentStatus.APPROVED;
    submission.reviewedBy = adminUserId;
    submission.reviewedAt = new Date();
    submission.adminNote = adminNote?.trim() || null;
    await this.instapayRepo.save(submission);

    this.logger.log(
      `InstaPay submission ${submission.id} approved by admin ${adminUserId}; payment ${savedPayment.id} created`,
    );
  }

  private async reject(
    submission: InstapayPayment,
    adminUserId: string,
    adminNote?: string,
  ): Promise<void> {
    const previousPath = submission.screenshotB2Path;

    submission.status = InstapayPaymentStatus.REJECTED;
    submission.reviewedBy = adminUserId;
    submission.reviewedAt = new Date();
    submission.adminNote = adminNote?.trim() || null;
    submission.screenshotB2Path = null;
    await this.instapayRepo.save(submission);

    if (previousPath) {
      this.b2StorageService
        .deleteFiles(previousPath)
        .catch((err) =>
          this.logger.warn(
            `Failed to delete rejected InstaPay screenshot ${previousPath}: ${(err as Error).message}`,
          ),
        );
    }

    const user =
      submission.user ||
      (await this.userRepo.findOne({ where: { id: submission.userId } }));
    if (user) {
      await this.sendRejectionEmail(
        user,
        submission.plan,
        adminNote || 'No reason provided.',
      );
    }

    this.logger.log(
      `InstaPay submission ${submission.id} rejected by admin ${adminUserId}`,
    );
  }

  // ─── Scheduled cleanup ─────────────────────────────────────────────

  async expireStaleRequests(): Promise<void> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - this.staleHours);

    const stale = await this.instapayRepo.find({
      where: {
        status: InstapayPaymentStatus.PENDING_VERIFICATION,
        createdAt: LessThan(cutoff),
      },
    });

    if (stale.length === 0) return;

    for (const row of stale) {
      const previousPath = row.screenshotB2Path;
      row.status = InstapayPaymentStatus.EXPIRED;
      row.screenshotB2Path = null;
      await this.instapayRepo.save(row);
      if (previousPath) {
        this.b2StorageService
          .deleteFiles(previousPath)
          .catch((err) =>
            this.logger.warn(
              `Failed to delete expired InstaPay screenshot ${previousPath}: ${(err as Error).message}`,
            ),
          );
      }
    }

    this.logger.log(
      `Expired ${stale.length} stale InstaPay submission(s) older than ${this.staleHours}h.`,
    );
  }

  // ─── Email helper ──────────────────────────────────────────────────

  private async sendRejectionEmail(
    user: User,
    plan: Plan,
    reason: string,
  ): Promise<void> {
    try {
      await this.mailService.sendMail({
        to: user.email,
        subject: 'Aamenn - InstaPay Payment Could Not Be Verified',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ef4444;">InstaPay Payment Rejected</h2>
            <p>Hi ${user.displayName || 'there'},</p>
            <p>We were unable to verify your InstaPay submission for the <strong>${plan.displayName}</strong> plan.</p>
            <p><strong>Reason:</strong></p>
            <blockquote style="margin:0;padding:12px 16px;border-left:3px solid #ef4444;background:#fef2f2;color:#7f1d1d;">
              ${this.escapeHtml(reason)}
            </blockquote>
            <p>You can submit a new payment from your Settings → Subscription page.</p>
            <p style="color:#6b7280;font-size:12px;">If you believe this was a mistake, please contact support.</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send InstaPay rejection email to ${user.email}: ${(error as Error).message}`,
      );
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
