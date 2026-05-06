import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'google_contact_id', nullable: true })
  googleContactId: string;

  @Column({ name: 'name_encrypted', type: 'text', nullable: true })
  nameEncrypted: string;

  @Column({ name: 'nickname_encrypted', type: 'text', nullable: true })
  nicknameEncrypted: string;

  @Column({ name: 'phone_encrypted', type: 'text', nullable: true })
  phoneEncrypted: string;

  @Column({ name: 'email_encrypted', type: 'text', nullable: true })
  emailEncrypted: string;

  @Column({ name: 'address_encrypted', type: 'text', nullable: true })
  addressEncrypted: string;

  @Column({ name: 'organization_encrypted', type: 'text', nullable: true })
  organizationEncrypted: string;

  @Column({ name: 'occupation_encrypted', type: 'text', nullable: true })
  occupationEncrypted: string;

  @Column({ name: 'birthday_encrypted', type: 'text', nullable: true })
  birthdayEncrypted: string;

  @Column({ name: 'bio_encrypted', type: 'text', nullable: true })
  bioEncrypted: string;

  @Column({ name: 'urls_encrypted', type: 'text', nullable: true })
  urlsEncrypted: string;

  @Column({ name: 'photo_url_encrypted', type: 'text', nullable: true })
  photoUrlEncrypted: string;

  @Column({ name: 'search_tokens', type: 'text', array: true, default: '{}' })
  searchTokens: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
