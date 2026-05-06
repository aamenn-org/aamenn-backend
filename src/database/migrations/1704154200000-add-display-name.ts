import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisplayName1704154200000 implements MigrationInterface {
  name = 'AddDisplayName1704154200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add display_name column (if not exists)
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'display_name');
  }
}
