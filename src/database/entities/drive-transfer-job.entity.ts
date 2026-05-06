import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export type DriveTransferJobStatus =
  | 'scanning'
  | 'ready'
  | 'transferring'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

@Entity('drive_transfer_jobs')
@Index(['userId', 'status'])
export class DriveTransferJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 20, default: 'scanning' })
  status: DriveTransferJobStatus;

  @Column({ type: 'jsonb', name: 'selected_types', default: '[]' })
  selectedTypes: string[];

  @Column({ type: 'boolean', name: 'include_shared', default: false })
  includeShared: boolean;

  @Column({ type: 'integer', name: 'total_items', default: 0 })
  totalItems: number;

  @Column({ type: 'bigint', name: 'total_bytes', default: 0 })
  totalBytes: number;

  @Column({ type: 'integer', name: 'transferred_items', default: 0 })
  transferredItems: number;

  @Column({ type: 'bigint', name: 'transferred_bytes', default: 0 })
  transferredBytes: number;

  @Column({ type: 'integer', name: 'failed_items', default: 0 })
  failedItems: number;

  @Column({ type: 'integer', name: 'skipped_items', default: 0 })
  skippedItems: number;

  @Column({ type: 'jsonb', name: 'scan_data', nullable: true })
  scanData: Record<string, any> | null;

  /** Maps driveParentId → aamennFolderId for folder structure preservation */
  @Column({ type: 'jsonb', name: 'folder_map', default: '{}' })
  folderMap: Record<string, string>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
