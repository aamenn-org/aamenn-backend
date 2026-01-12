import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminRole1704154300000 implements MigrationInterface {
  name = 'AddAdminRole1704154300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add role column to users table
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "role" VARCHAR(20) NOT NULL DEFAULT 'user'
    `);

    // Add is_active column to users table
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true
    `);

    // Add last_login_at column to users table
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP
    `);

    // Create index on role for faster admin queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_role" ON "users" ("role")
    `);

    // Create index on is_active for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_is_active" ON "users" ("is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_is_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_role"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "last_login_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "is_active"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`);
  }
}
