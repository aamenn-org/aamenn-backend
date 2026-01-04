import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { AlbumFile } from './album-file.entity';

@Entity('albums')
@Index(['userId'])
export class Album {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  /**
   * The album title, encrypted client-side.
   * Backend cannot read this - only the client can.
   */
  @Column({ type: 'text', name: 'title_encrypted' })
  titleEncrypted: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.albums, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => AlbumFile, (albumFile) => albumFile.album)
  albumFiles: AlbumFile[];
}
