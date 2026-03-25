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

export type UploadSessionStatus = 'active' | 'completed' | 'cancelled' | 'expired';

export interface CompletedPart {
  partNumber: number;
  sha1: string;
}

@Entity('upload_sessions')
@Index(['userId', 'status'])
export class UploadSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'text', name: 'b2_file_id' })
  b2FileId: string;

  @Column({ type: 'text', name: 'b2_file_path' })
  b2FilePath: string;

  @Column({ type: 'text', name: 'file_name_encrypted' })
  fileNameEncrypted: string;

  @Column({ type: 'text', name: 'cipher_file_key' })
  cipherFileKey: string;

  @Column({ type: 'text', name: 'mime_type', nullable: true })
  mimeType: string | null;

  @Column({ type: 'bigint', name: 'total_bytes' })
  totalBytes: number;

  @Column({ type: 'integer', name: 'total_parts' })
  totalParts: number;

  @Column({ type: 'integer', name: 'chunk_size_bytes' })
  chunkSizeBytes: number;

  @Column({ type: 'jsonb', name: 'completed_parts', default: '[]' })
  completedParts: CompletedPart[];

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: UploadSessionStatus;

  @Column({ type: 'varchar', length: 64, name: 'content_hash', nullable: true })
  contentHash: string | null;

  @Column({ type: 'uuid', name: 'folder_id', nullable: true })
  folderId: string | null;

  @Column({ type: 'integer', nullable: true })
  width: number | null;

  @Column({ type: 'integer', nullable: true })
  height: number | null;

  @Column({ type: 'integer', nullable: true })
  duration: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
