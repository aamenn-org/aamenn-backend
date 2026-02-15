import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLargeThumbnail1704154500000 implements MigrationInterface {
  name = 'AddLargeThumbnail1704154500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add large thumbnail path (encrypted in B2)
    await queryRunner.query(`
      ALTER TABLE "files" 
      ADD COLUMN IF NOT EXISTS "b2_thumb_large_path" text
    `);

    // Add cipher key for large thumbnail (encrypted with user's master key)
    await queryRunner.query(`
      ALTER TABLE "files" 
      ADD COLUMN IF NOT EXISTS "cipher_thumb_large_key" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "files" 
      DROP COLUMN IF EXISTS "b2_thumb_large_path",
      DROP COLUMN IF EXISTS "cipher_thumb_large_key"
    `);
  }
}
