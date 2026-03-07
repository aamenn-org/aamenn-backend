import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { AlbumFile } from './album-file.entity';

@Entity('files')
@Index(['userId', 'deletedAt'])
export class File {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'text', name: 'b2_file_path' })
  b2FilePath: string;

  /**
   * B2 path for small thumbnail (150x150)
   */
  @Column({ type: 'text', name: 'b2_thumb_small_path', nullable: true })
  b2ThumbSmallPath: string | null;

  /**
   * B2 path for medium thumbnail (800x800)
   */
  @Column({ type: 'text', name: 'b2_thumb_medium_path', nullable: true })
  b2ThumbMediumPath: string | null;

  /**
   * B2 path for large thumbnail (target 20-30% of original file size)
   */
  @Column({ type: 'text', name: 'b2_thumb_large_path', nullable: true })
  b2ThumbLargePath: string | null;

  /**
   * The file encryption key, encrypted with the user's master key.
   * Backend cannot decrypt this - only the client can.
   */
  @Column({ type: 'text', name: 'cipher_file_key' })
  cipherFileKey: string;

  
  /**
   * The original filename, encrypted client-side.
   * Backend cannot read this - only the client can.
   */
  @Column({ type: 'text', name: 'file_name_encrypted' })
  fileNameEncrypted: string;

  @Column({ type: 'text', name: 'mime_type', nullable: true })
  mimeType: string | null;

  @Column({ type: 'bigint', name: 'size_bytes', nullable: true })
  sizeBytes: number | null;

  
  /**
   * Original image width
   */
  @Column({ type: 'integer', nullable: true })
  width: number | null;

  /**
   * Original image height
   */
  @Column({ type: 'integer', nullable: true })
  height: number | null;

  /**
   * Video duration in seconds (for video files only)
   */
  @Column({ type: 'integer', nullable: true })
  duration: number | null;

  /**
   * Whether this file is marked as favorite
   */
  @Column({ type: 'boolean', name: 'is_favorite', default: false })
  isFavorite: boolean;

  /**
   * SHA-256 hash of the ORIGINAL file content (before encryption).
   * Used for duplicate detection. This is computed client-side.
   * While this reveals that two files have the same content, it doesn't
   * reveal WHAT that content is (zero-knowledge preserved).
   */
  @Column({ type: 'varchar', length: 64, name: 'content_hash', nullable: true })
  @Index()
  contentHash: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  // Relations
  @ManyToOne(() => User, (user) => user.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => AlbumFile, (albumFile) => albumFile.file)
  albumFiles: AlbumFile[];
}
