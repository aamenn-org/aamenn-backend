import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentHash1704154100000 implements MigrationInterface {
  name = 'AddContentHash1704154100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add content_hash column for duplicate detection
    await queryRunner.query(`
      ALTER TABLE "files" 
      ADD COLUMN "content_hash" varchar(64)
    `);

    // Create index for fast duplicate lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_files_content_hash" ON "files" ("content_hash")
      WHERE "content_hash" IS NOT NULL
    `);

    // Create compound index for user + hash lookups (most common query)
    await queryRunner.query(`
      CREATE INDEX "IDX_files_user_content_hash" ON "files" ("user_id", "content_hash")
      WHERE "content_hash" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_files_user_content_hash"`);
    await queryRunner.query(`DROP INDEX "IDX_files_content_hash"`);
    await queryRunner.query(`ALTER TABLE "files" DROP COLUMN "content_hash"`);
  }
}
