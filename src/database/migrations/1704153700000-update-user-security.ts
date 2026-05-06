import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Update user_security table for proper zero-knowledge encryption flow.
 *
 * Changes:
 * - Rename password_salt -> kek_salt
 * - Add encrypted_master_key column
 */
export class UpdateUserSecurity1704153700000 implements MigrationInterface {
  name = 'UpdateUserSecurity1704153700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename password_salt to kek_salt
    await queryRunner.query(`
      ALTER TABLE "user_security" 
      RENAME COLUMN "password_salt" TO "kek_salt"
    `);

    // Add encrypted_master_key column
    await queryRunner.query(`
      ALTER TABLE "user_security" 
      ADD COLUMN "encrypted_master_key" TEXT
    `);

    // For existing users, we'd need to handle migration separately
    // For now, just make it NOT NULL for new records after clearing old data
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rename kek_salt back to password_salt
    await queryRunner.query(`
      ALTER TABLE "user_security" 
      RENAME COLUMN "kek_salt" TO "password_salt"
    `);

    // Remove encrypted_master_key column
    await queryRunner.query(`
      ALTER TABLE "user_security" 
      DROP COLUMN "encrypted_master_key"
    `);
  }
}
