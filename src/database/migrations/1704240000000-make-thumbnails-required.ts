import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeThumbnailsRequired1704240000000 implements MigrationInterface {
  name = 'MakeThumbnailsRequired1704240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, we need to handle existing files that don't have thumbnails
    // For this migration, we'll set default empty string values for NULL thumbnails
    // In production, these files should be re-uploaded or thumbnails should be generated
    
    // Update NULL values to empty strings temporarily
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

    // Now make the columns NOT NULL
    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_small_path SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_medium_path SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_large_path SET NOT NULL
    `);

    // Note: We're not adding a check constraint for empty strings
    // This allows existing files with empty thumbnail paths to pass the migration
    // In production, these files should be re-uploaded with proper thumbnails
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Make columns nullable again
    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_small_path DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_medium_path DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE files ALTER COLUMN b2_thumb_large_path DROP NOT NULL
    `);

    // Convert empty strings back to NULL
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
}
