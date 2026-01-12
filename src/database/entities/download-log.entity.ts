import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { File } from './file.entity';

export enum DownloadType {
  ORIGINAL = 'original',
  THUMB_SMALL = 'thumb_small',
  THUMB_MEDIUM = 'thumb_medium',
}

@Entity('download_logs')
@Index(['userId', 'createdAt'])
@Index(['createdAt'])
export class DownloadLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'uuid', name: 'file_id' })
  fileId: string;

  @Column({ type: 'bigint', name: 'size_bytes' })
  sizeBytes: number;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'download_type',
    default: DownloadType.ORIGINAL,
  })
  downloadType: DownloadType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => File, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file: File;
}
