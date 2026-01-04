import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Album } from './album.entity';
import { File } from './file.entity';

@Entity('album_files')
@Index(['albumId', 'orderIndex'])
export class AlbumFile {
  @PrimaryColumn({ type: 'uuid', name: 'album_id' })
  albumId: string;

  @PrimaryColumn({ type: 'uuid', name: 'file_id' })
  fileId: string;

  @Column({ type: 'integer', name: 'order_index', default: 0 })
  orderIndex: number;

  // Relations
  @ManyToOne(() => Album, (album) => album.albumFiles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'album_id' })
  album: Album;

  @ManyToOne(() => File, (file) => file.albumFiles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file: File;
}
