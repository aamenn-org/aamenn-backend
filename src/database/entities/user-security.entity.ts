import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Stores client-side encryption parameters (zero-knowledge).
 *
 * Best Practice Flow:
 * - Client generates random Master Key
 * - Client derives KEK from password using KDF(password, salt)
 * - Client encrypts Master Key with KEK
 * - Server stores ONLY the encrypted master key and KDF params
 * - Server NEVER sees the plaintext master key or password
 */
@Entity('user_security')
export class UserSecurity {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  /**
   * The master key encrypted with the user's KEK (Key Encryption Key).
   * KEK is derived from password + kekSalt using KDF.
   * Format: base64(IV + AES-256-GCM(masterKey))
   */
  @Column({ type: 'text', name: 'encrypted_master_key' })
  encryptedMasterKey: string;

  /**
   * Salt used to derive KEK from password.
   * Format: base64(random 16 bytes)
   */
  @Column({ type: 'text', name: 'kek_salt' })
  kekSalt: string;

  /**
   * KDF parameters for deriving KEK from password.
   */
  @Column({ type: 'jsonb', name: 'kdf_params' })
  kdfParams: {
    algorithm: string; // 'pbkdf2' | 'argon2id'
    iterations?: number;
    memory?: number;
    parallelism?: number;
    hashLength?: number;
  };

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @OneToOne(() => User, (user) => user.security, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
