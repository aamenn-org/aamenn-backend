import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Plan } from '../../database/entities/plan.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../../database/entities/subscription.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import { User } from '../../database/entities/user.entity';
import { PaymobService } from './paymob.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly gracePeriodDays: number;

  constructor(
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly paymobService: PaymobService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    this.gracePeriodDays = this.configService.get<number>(
      'paymob.gracePeriodDays',
      7,
    );
  }

  // ─── Plans ──────────────────────────────────────────────────────────

  async getActivePlans(): Promise<Plan[]> {
    return this.planRepo.find({
      where: { isActive: true },
      order: { storageGb: 'ASC' },
    });
  }

  async getPlanById(planId: string): Promise<Plan> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  // ─── Subscriptions ─────────────────────────────────────────────────

  async getUserSubscription(userId: string): Promise<Subscription | null> {
    return this.subscriptionRepo.findOne({
      where: {
        userId,
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE]),
      },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });
  }

  async getUserSubscriptionHistory(userId: string): Promise<Subscription[]> {
    return this.subscriptionRepo.find({
      where: { userId },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  // ─── Checkout Flow ─────────────────────────────────────────────────

  async initiateCheckout(
    user: User,
    planId: string,
    isRenewal = false,
  ): Promise<{ checkoutUrl: string; paymentId: string }> {
    const plan = await this.getPlanById(planId);
    if (!plan.isActive) {
      throw new BadRequestException('This plan is no longer available');
    }

    // For new subscriptions, prevent duplicate active subs to the same plan
    if (!isRenewal) {
      const existing = await this.subscriptionRepo.findOne({
        where: {
          userId: user.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
        },
      });
      if (existing) {
        throw new ConflictException(
          'You already have an active subscription to this plan',
        );
      }
    }

    // Create pending payment record
    const payment = this.paymentRepo.create({
      userId: user.id,
      planId: plan.id,
      amountPiasters: plan.pricePiasters,
      currency: 'EGP',
      status: PaymentStatus.PENDING,
    });
    await this.paymentRepo.save(payment);

    // Create Paymob intention
    const nameParts = (user.displayName || user.email.split('@')[0]).split(' ');
    const intention = await this.paymobService.createPaymentIntention(
      plan.pricePiasters,
      'EGP',
      {
        first_name: nameParts[0] || 'User',
        last_name: nameParts.slice(1).join(' ') || 'N/A',
        email: user.email,
        phone_number: 'NA',
      },
      {
        payment_id: payment.id,
        user_id: user.id,
        plan_id: plan.id,
        plan_name: plan.name,
      },
    );

    // Update payment with Paymob reference
    payment.paymobIntentionId = intention.intention_id;
    await this.paymentRepo.save(payment);

    const checkoutUrl = this.paymobService.getCheckoutUrl(
      intention.client_secret,
    );

    return { checkoutUrl, paymentId: payment.id };
  }

  // ─── Renewal ───────────────────────────────────────────────────────

  async initiateRenewal(
    user: User,
  ): Promise<{ checkoutUrl: string; paymentId: string }> {
    const subscription = await this.getUserSubscription(user.id);
    if (!subscription) {
      throw new BadRequestException('No active subscription to renew');
    }

    return this.initiateCheckout(user, subscription.planId, true);
  }

  // ─── Webhook Processing ────────────────────────────────────────────

  async processWebhook(
    transactionData: Record<string, unknown>,
  ): Promise<void> {
    const success = transactionData['success'] as boolean;
    const transactionId = String(transactionData['id']);
    const orderId = String(
      (transactionData['order'] as Record<string, unknown>)?.['id'] || '',
    );
    const amountCents = Number(transactionData['amount_cents']);
    const sourceData = transactionData['source_data'] as
      | Record<string, unknown>
      | undefined;
    const paymentMethod = sourceData
      ? `${sourceData['type']}:${sourceData['sub_type']}`
      : null;

    // Find payment by the special_reference (which is our payment ID)
    // Paymob nests merchant_order_id inside the order object
    const extras = transactionData['extras'] as
      | Record<string, string>
      | undefined;
    const orderObj = transactionData['order'] as
      | Record<string, unknown>
      | undefined;
    const merchantOrderId =
      (orderObj?.['merchant_order_id'] as string | undefined) ||
      (transactionData['merchant_order_id'] as string | undefined);
    const paymentId = extras?.payment_id || merchantOrderId;

    if (!paymentId) {
      this.logger.warn(
        `Webhook received without payment_id reference. Transaction: ${transactionId}`,
      );
      return;
    }

    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['plan'],
    });

    if (!payment) {
      this.logger.warn(`Payment not found for ID: ${paymentId}`);
      return;
    }

    // Idempotency: skip if already processed
    if (payment.status === PaymentStatus.SUCCESS) {
      this.logger.log(
        `Payment ${paymentId} already processed successfully. Skipping.`,
      );
      return;
    }

    payment.paymobTransactionId = transactionId;
    payment.paymobOrderId = orderId;
    payment.paymentMethod = paymentMethod;

    if (success && amountCents === payment.amountPiasters) {
      payment.status = PaymentStatus.SUCCESS;
      payment.paidAt = new Date();
      await this.paymentRepo.save(payment);

      // Activate subscription
      await this.activateSubscription(payment);

      this.logger.log(
        `Payment ${paymentId} succeeded. Subscription activated for user ${payment.userId}`,
      );
    } else {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = !success
        ? String(
            transactionData['data.message'] ||
              transactionData['data_message'] ||
              'Payment declined',
          )
        : `Amount mismatch: expected ${payment.amountPiasters}, got ${amountCents}`;
      await this.paymentRepo.save(payment);

      this.logger.warn(`Payment ${paymentId} failed: ${payment.failureReason}`);
    }
  }

  // ─── Subscription Activation ───────────────────────────────────────

  async activateSubscription(payment: Payment): Promise<void> {
    const plan = payment.plan || (await this.getPlanById(payment.planId));
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + plan.durationDays);

    // Expire any existing active/grace subscriptions for this user
    await this.subscriptionRepo.update(
      {
        userId: payment.userId,
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE]),
      },
      { status: SubscriptionStatus.EXPIRED },
    );

    // Create new subscription
    const subscription = this.subscriptionRepo.create({
      userId: payment.userId,
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      paymobTransactionId: payment.paymobTransactionId,
    });
    await this.subscriptionRepo.save(subscription);

    // Link payment to subscription
    payment.subscriptionId = subscription.id;
    await this.paymentRepo.save(payment);

    // Update user's storage limit
    await this.userRepo.update(payment.userId, {
      storageLimitGb: plan.storageGb,
    });

    // Send confirmation email
    const user = await this.userRepo.findOne({ where: { id: payment.userId } });
    if (user) {
      await this.sendPaymentConfirmationEmail(user, plan, payment);
    }
  }

  // ─── Subscription Lifecycle (called by scheduler) ──────────────────

  async processExpiredSubscriptions(): Promise<void> {
    const now = new Date();

    // Move ACTIVE subscriptions past their period end to GRACE
    const expiredActive = await this.subscriptionRepo.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
      },
    });

    for (const sub of expiredActive) {
      if (sub.currentPeriodEnd <= now) {
        const graceEnd = new Date(sub.currentPeriodEnd);
        graceEnd.setDate(graceEnd.getDate() + this.gracePeriodDays);

        sub.status = SubscriptionStatus.GRACE;
        sub.graceEndsAt = graceEnd;
        await this.subscriptionRepo.save(sub);

        // Send grace period warning email
        const user = await this.userRepo.findOne({ where: { id: sub.userId } });
        if (user) {
          await this.sendGracePeriodEmail(user, sub);
        }

        this.logger.log(
          `Subscription ${sub.id} moved to grace period until ${graceEnd.toISOString()}`,
        );
      }
    }

    // Move GRACE subscriptions past grace end to EXPIRED and downgrade storage
    const expiredGrace = await this.subscriptionRepo.find({
      where: {
        status: SubscriptionStatus.GRACE,
      },
    });

    for (const sub of expiredGrace) {
      if (sub.graceEndsAt && sub.graceEndsAt <= now) {
        sub.status = SubscriptionStatus.EXPIRED;
        await this.subscriptionRepo.save(sub);

        // Downgrade user to free tier (5GB)
        await this.userRepo.update(sub.userId, { storageLimitGb: 5 });

        // Send downgrade notification
        const user = await this.userRepo.findOne({ where: { id: sub.userId } });
        if (user) {
          await this.sendDowngradeEmail(user);
        }

        this.logger.log(
          `Subscription ${sub.id} expired. User ${sub.userId} downgraded to free tier.`,
        );
      }
    }
  }

  // ─── Stale Payment Cleanup ──────────────────────────────────────────

  async expireStalePendingPayments(): Promise<void> {
    // Expire PENDING payments older than 2 hours (Paymob sessions typically expire in ~30 min)
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 2);

    const result = await this.paymentRepo
      .createQueryBuilder()
      .update(Payment)
      .set({ status: PaymentStatus.EXPIRED })
      .where('status = :status', { status: PaymentStatus.PENDING })
      .andWhere('created_at < :cutoff', { cutoff })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`Expired ${result.affected} stale pending payment(s).`);
    }
  }

  // ─── Payment History ───────────────────────────────────────────────

  async getUserPayments(userId: string): Promise<Payment[]> {
    return this.paymentRepo.find({
      where: { userId },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  // ─── Email Helpers ─────────────────────────────────────────────────

  private async sendPaymentConfirmationEmail(
    user: User,
    plan: Plan,
    payment: Payment,
  ): Promise<void> {
    try {
      await this.mailService.sendMail({
        to: user.email,
        subject: 'Aamenn - Payment Confirmed',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Payment Confirmed!</h2>
            <p>Hi ${user.displayName || 'there'},</p>
            <p>Your payment for the <strong>${plan.displayName}</strong> plan has been confirmed.</p>
            <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
              <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Plan</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${plan.displayName} (${plan.storageGb}GB)</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Amount</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">EGP ${(payment.amountPiasters / 100).toFixed(2)}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Transaction ID</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${payment.paymobTransactionId || payment.id}</td></tr>
            </table>
            <p>Your storage has been upgraded to <strong>${plan.storageGb}GB</strong>.</p>
            <p style="color: #6b7280; font-size: 12px;">If you didn't make this payment, please contact support immediately.</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send payment confirmation email to ${user.email}: ${error.message}`,
      );
    }
  }

  private async sendGracePeriodEmail(
    user: User,
    subscription: Subscription,
  ): Promise<void> {
    try {
      await this.mailService.sendMail({
        to: user.email,
        subject: 'Aamenn - Subscription Expiring Soon',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f59e0b;">Subscription Expiring</h2>
            <p>Hi ${user.displayName || 'there'},</p>
            <p>Your subscription has expired. You have a <strong>${this.gracePeriodDays}-day grace period</strong> to renew before your storage is downgraded.</p>
            <p><strong>Grace period ends:</strong> ${subscription.graceEndsAt?.toLocaleDateString()}</p>
            <p>During this time, your files remain safe but you cannot upload new files beyond the free tier limit.</p>
            <p>Please log in to your account to renew your subscription.</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send grace period email to ${user.email}: ${error.message}`,
      );
    }
  }

  private async sendDowngradeEmail(user: User): Promise<void> {
    try {
      await this.mailService.sendMail({
        to: user.email,
        subject: 'Aamenn - Storage Downgraded',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ef4444;">Storage Downgraded</h2>
            <p>Hi ${user.displayName || 'there'},</p>
            <p>Your subscription grace period has ended and your storage has been downgraded to the free tier (5GB).</p>
            <p><strong>Your existing files are safe</strong> — nothing has been deleted. However, you won't be able to upload new files if your storage usage exceeds 5GB.</p>
            <p>To restore your storage, please renew your subscription.</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send downgrade email to ${user.email}: ${error.message}`,
      );
    }
  }
}
