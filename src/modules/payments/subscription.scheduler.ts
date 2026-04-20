import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

@Injectable()
export class SubscriptionScheduler {
  private readonly logger = new Logger(SubscriptionScheduler.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleSubscriptionLifecycle(): Promise<void> {
    this.logger.log('Running subscription lifecycle check...');
    try {
      await this.paymentsService.processExpiredSubscriptions();
      await this.paymentsService.expireStalePendingPayments();
      this.logger.log('Subscription lifecycle check completed.');
    } catch (error) {
      this.logger.error(
        `Subscription lifecycle check failed: ${error.message}`,
        error.stack,
      );
    }
  }
}
