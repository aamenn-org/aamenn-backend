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

export enum InstapayPaymentStatus {
  PENDING_VERIFICATION = 'pending_verification',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

@Entity('instapay_payments')
@Index('IDX_instapay_user_status', ['userId', 'status'])
@Index('IDX_instapay_status_created', ['status', 'createdAt'])
export class InstapayPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'uuid', name: 'plan_id' })
  planId: string;

  @Column({ type: 'integer', name: 'amount_piasters' })
  amountPiasters: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: InstapayPaymentStatus.PENDING_VERIFICATION,
  })
  status: InstapayPaymentStatus;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'screenshot_b2_path',
    nullable: true,
  })
  screenshotB2Path: string | null;

  @Column({ type: 'varchar', length: 50, name: 'screenshot_mime_type' })
  screenshotMimeType: string;

  @Column({ type: 'varchar', length: 100, name: 'instapay_reference' })
  instapayReference: string;

  @Column({ type: 'varchar', length: 100, name: 'sender_name', nullable: true })
  senderName: string | null;

  @Column({ type: 'text', name: 'admin_note', nullable: true })
  adminNote: string | null;

  @Column({ type: 'uuid', name: 'reviewed_by', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamp', name: 'reviewed_at', nullable: true })
  reviewedAt: Date | null;

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

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer: User | null;
}
