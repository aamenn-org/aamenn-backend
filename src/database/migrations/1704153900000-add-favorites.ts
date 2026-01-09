import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFavorites1704153900000 implements MigrationInterface {
  name = 'AddFavorites1704153900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add isFavorite column to files table (if not exists)
    await queryRunner.query(`
      ALTER TABLE "files" 
      ADD COLUMN IF NOT EXISTS "is_favorite" BOOLEAN NOT NULL DEFAULT false
    `);

    // Create index for faster favorite queries (if not exists)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_files_user_favorite" ON "files" ("user_id", "is_favorite") 
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_files_user_favorite"`);
    await queryRunner.query(`ALTER TABLE "files" DROP COLUMN "is_favorite"`);
  }
}
