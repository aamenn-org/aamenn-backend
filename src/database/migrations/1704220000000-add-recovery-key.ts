import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecoveryKey1704220000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add recovery key columns to user_security table
    await queryRunner.query(`
      ALTER TABLE "user_security"
      ADD COLUMN IF NOT EXISTS "recovery_encrypted_master_key" text,
      ADD COLUMN IF NOT EXISTS "recovery_salt" text,
      ADD COLUMN IF NOT EXISTS "recovery_kdf_params" jsonb,
      ADD COLUMN IF NOT EXISTS "encrypted_recovery_key" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_security"
      DROP COLUMN IF EXISTS "recovery_encrypted_master_key",
      DROP COLUMN IF EXISTS "recovery_salt",
      DROP COLUMN IF EXISTS "recovery_kdf_params",
      DROP COLUMN IF EXISTS "encrypted_recovery_key"
    `);
  }
}
