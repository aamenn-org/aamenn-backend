import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeThumbnailsOptional1704260000000 implements MigrationInterface {
  name = 'MakeThumbnailsOptional1704260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make thumbnail columns nullable to support files without thumbnails
    // (e.g., PDFs, documents, or when frontend doesn't send thumbnails)
    
    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_small_path DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_medium_path DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_large_path DROP NOT NULL
    `);

    // Convert empty strings to NULL for cleaner data
    await queryRunner.query(`
      UPDATE files 
      SET b2_thumb_small_path = NULL WHERE b2_thumb_small_path = ''
    `);
    
    await queryRunner.query(`
      UPDATE files 
      SET b2_thumb_medium_path = NULL WHERE b2_thumb_medium_path = ''
    `);
    
    await queryRunner.query(`
      UPDATE files 
      SET b2_thumb_large_path = NULL WHERE b2_thumb_large_path = ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: Make columns NOT NULL again
    // First set empty string for NULL values
    await queryRunner.query(`
      UPDATE files 
      SET b2_thumb_small_path = '' WHERE b2_thumb_small_path IS NULL
    `);
    
    await queryRunner.query(`
      UPDATE files 
      SET b2_thumb_medium_path = '' WHERE b2_thumb_medium_path IS NULL
    `);
    
    await queryRunner.query(`
      UPDATE files 
      SET b2_thumb_large_path = '' WHERE b2_thumb_large_path IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_small_path SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_medium_path SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_large_path SET NOT NULL
    `);
  }
}
