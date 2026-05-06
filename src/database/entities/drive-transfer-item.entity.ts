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
import { DriveTransferJob } from './drive-transfer-job.entity';

export type DriveTransferItemStatus =
  | 'pending'
  | 'downloading'
  | 'encrypting'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'skipped';

@Entity('drive_transfer_items')
@Index(['jobId', 'status'])
@Index(['userId'])
@Index(['jobId', 'driveParentId'])
export class DriveTransferItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'job_id' })
  jobId: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 100, name: 'drive_file_id' })
  driveFileId: string;

  /** Original plaintext name — purged after job completion for zero-knowledge compliance */
  @Column({ type: 'text', name: 'drive_name' })
  driveName: string;

  @Column({ type: 'varchar', length: 255, name: 'drive_mime_type', nullable: true })
  driveMimeType: string | null;

  @Column({ type: 'bigint', name: 'drive_size_bytes', default: 0 })
  driveSizeBytes: number;

  @Column({ type: 'varchar', length: 100, name: 'drive_parent_id', nullable: true })
  driveParentId: string | null;

  @Column({ type: 'boolean', name: 'is_folder', default: false })
  isFolder: boolean;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: DriveTransferItemStatus;

  @Column({ type: 'uuid', name: 'aamenn_file_id', nullable: true })
  aamennFileId: string | null;

  @Column({ type: 'uuid', name: 'aamenn_folder_id', nullable: true })
  aamennFolderId: string | null;

  @Column({ type: 'text', name: 'drive_folder_path', nullable: true })
  driveFolderPath: string | null;

  @Column({ type: 'integer', default: 0 })
  retries: number;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => DriveTransferJob, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: DriveTransferJob;
}
