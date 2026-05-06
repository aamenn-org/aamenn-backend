import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrashRetention1704250000000 implements MigrationInterface {
  name = 'AddTrashRetention1704250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add trash_retention_days column to users table
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN "trash_retention_days" INTEGER NOT NULL DEFAULT 30
    `);

    // Add comment for documentation
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."trash_retention_days" IS 
      'Number of days to retain files in trash before automatic permanent deletion'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" 
      DROP COLUMN "trash_retention_days"
    `);
  }
}
