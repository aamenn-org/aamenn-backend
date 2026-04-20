import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';

import { Plan } from '../../database/entities/plan.entity';
import { Subscription } from '../../database/entities/subscription.entity';
import { Payment } from '../../database/entities/payment.entity';
import { User } from '../../database/entities/user.entity';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymobService } from './paymob.service';
import { SubscriptionScheduler } from './subscription.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Plan, Subscription, Payment, User]),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymobService, SubscriptionScheduler],
  exports: [PaymentsService],
})
export class PaymentsModule {}
