import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Plan } from './plan.entity';
import { Subscription } from './subscription.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  EXPIRED = 'expired',
}

@Entity('payments')
@Index('IDX_payment_paymob_transaction', ['paymobTransactionId'], {
  unique: true,
  where: '"paymob_transaction_id" IS NOT NULL',
})
@Index('IDX_payment_paymob_order', ['paymobOrderId'])
@Index('IDX_payment_user', ['userId'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'uuid', name: 'subscription_id', nullable: true })
  subscriptionId: string | null;

  @Column({ type: 'uuid', name: 'plan_id' })
  planId: string;

  @Column({ type: 'integer', name: 'amount_piasters' })
  amountPiasters: number;

  @Column({ type: 'varchar', length: 10, default: 'EGP' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ type: 'varchar', name: 'paymob_order_id', nullable: true })
  paymobOrderId: string | null;

  @Column({ type: 'varchar', name: 'paymob_transaction_id', nullable: true })
  paymobTransactionId: string | null;

  @Column({ type: 'varchar', name: 'paymob_intention_id', nullable: true })
  paymobIntentionId: string | null;

  @Column({
    type: 'varchar',
    name: 'payment_method',
    length: 50,
    nullable: true,
  })
  paymentMethod: string | null;

  @Column({ type: 'text', name: 'failure_reason', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamp', name: 'paid_at', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Plan)
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;

  @ManyToOne(() => Subscription, { nullable: true })
  @JoinColumn({ name: 'subscription_id' })
  subscription: Subscription | null;
}
