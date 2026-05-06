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

  /**
   * Master key encrypted with recovery-derived KEK.
   * Used when user forgets password but has recovery key.
   */
  @Column({ type: 'text', name: 'recovery_encrypted_master_key', nullable: true })
  recoveryEncryptedMasterKey: string | null;

  /**
   * Salt used to derive recovery KEK from recovery key.
   */
  @Column({ type: 'text', name: 'recovery_salt', nullable: true })
  recoverySalt: string | null;

  /**
   * KDF parameters for deriving recovery KEK.
   */
  @Column({ type: 'jsonb', name: 'recovery_kdf_params', nullable: true })
  recoveryKdfParams: {
    algorithm: string;
    iterations?: number;
    memory?: number;
    parallelism?: number;
    hashLength?: number;
  } | null;

  /**
   * Recovery key encrypted with masterKey.
   * Allows user to view their recovery key later from Settings.
   */
  @Column({ type: 'text', name: 'encrypted_recovery_key', nullable: true })
  encryptedRecoveryKey: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @OneToOne(() => User, (user) => user.security, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
