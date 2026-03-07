import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { UserSecurity } from './user-security.entity';
import { File } from './file.entity';
import { Album } from './album.entity';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  email: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'display_name',
  })
  displayName: string | null;

  @Column({ type: 'text', unique: true, name: 'auth_provider_id' })
  authProviderId: string;

  @Column({ type: 'text', nullable: true, name: 'password_hash' })
  passwordHash: string | null;

  @Column({ type: 'text', nullable: true, name: 'auth_provider' })
  authProvider: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', name: 'last_login_at', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'avatar_file_id' })
  avatarFileId: string | null;

  @Column({ type: 'integer', name: 'trash_retention_days', default: 30 })
  trashRetentionDays: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @OneToOne(() => UserSecurity, (security) => security.user)
  security: UserSecurity;

  @OneToMany(() => File, (file) => file.user)
  files: File[];

  @OneToMany(() => Album, (album) => album.user)
  albums: Album[];
}
