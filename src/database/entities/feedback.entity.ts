import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum FeedbackCategory {
  UPLOAD_ISSUE = 'upload_issue',
  PREVIEW_ISSUE = 'preview_issue',
  SUBSCRIPTION_ISSUE = 'subscription_issue',
  PERFORMANCE_ISSUE = 'performance_issue',
  UI_UX_ISSUE = 'ui_ux_issue',
  FEATURE_REQUEST = 'feature_request',
  OTHER = 'other',
}

@Entity('feedbacks')
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: FeedbackCategory.OTHER,
  })
  category: FeedbackCategory;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
