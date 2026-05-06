import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddThumbnailColumns1704153800000 implements MigrationInterface {
  name = 'AddThumbnailColumns1704153800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add thumbnail paths for small and medium sizes (encrypted in B2)
    await queryRunner.query(`
      ALTER TABLE "files" 
      ADD COLUMN IF NOT EXISTS "b2_thumb_small_path" text,
      ADD COLUMN IF NOT EXISTS "b2_thumb_medium_path" text
    `);

    // Add cipher keys for thumbnails (encrypted with user's master key)
    await queryRunner.query(`
      ALTER TABLE "files" 
      ADD COLUMN IF NOT EXISTS "cipher_thumb_small_key" text,
      ADD COLUMN IF NOT EXISTS "cipher_thumb_medium_key" text
    `);

    // Add blurhash column (plaintext - safe, doesn't reveal image content)
    await queryRunner.query(`
      ALTER TABLE "files" 
      ADD COLUMN IF NOT EXISTS "blurhash" varchar(100)
    `);

    // Add original image dimensions for aspect ratio
    await queryRunner.query(`
      ALTER TABLE "files" 
      ADD COLUMN IF NOT EXISTS "width" integer,
      ADD COLUMN IF NOT EXISTS "height" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "files" 
      DROP COLUMN IF EXISTS "b2_thumb_small_path",
      DROP COLUMN IF EXISTS "b2_thumb_medium_path",
      DROP COLUMN IF EXISTS "cipher_thumb_small_key",
      DROP COLUMN IF EXISTS "cipher_thumb_medium_key",
      DROP COLUMN IF EXISTS "blurhash",
      DROP COLUMN IF EXISTS "width",
      DROP COLUMN IF EXISTS "height"
    `);
  }
}
