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
