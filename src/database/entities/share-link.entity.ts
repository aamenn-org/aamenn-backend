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

export enum ShareResourceType {
  FILE = 'file',
  ALBUM = 'album',
}

@Entity('share_links')
@Index(['ownerUserId', 'createdAt'])
@Index(['resourceType', 'resourceId'])
@Index(['expiresAt'])
export class ShareLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  slug: string;

  @Column({ type: 'uuid', name: 'owner_user_id' })
  ownerUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id' })
  owner: User;

  @Column({
    type: 'enum',
    enum: ShareResourceType,
    name: 'resource_type',
  })
  resourceType: ShareResourceType;

  @Column({ type: 'uuid', name: 'resource_id' })
  resourceId: string;

  @Column({ type: 'text', name: 'share_key' })
  shareKey: string;

  @Column({ type: 'timestamp', name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamp', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
