import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1704210000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Composite index for album file queries (albumId + orderIndex)
    // Improves performance when listing files in an album
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_album_files_album_id_order_index" 
      ON "album_files" ("album_id", "order_index")
    `);

    // Composite index for file queries by user and deletion status
    // Already exists but ensure it's optimal
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_files_user_id_deleted_at" 
      ON "files" ("user_id", "deleted_at")
    `);

    // Index on content_hash for duplicate detection
    // Already exists but ensure it's present
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_files_content_hash" 
      ON "files" ("content_hash") 
      WHERE "content_hash" IS NOT NULL
    `);

    // Composite index for download logs queries (userId + createdAt)
    // Improves performance for bandwidth statistics
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_download_logs_user_id_created_at" 
      ON "download_logs" ("user_id", "created_at")
    `);

    // Index on download logs createdAt for time-based queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_download_logs_created_at" 
      ON "download_logs" ("created_at")
    `);

    // Composite index for user queries (role + isActive)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_role_is_active" 
      ON "users" ("role", "is_active")
    `);

    // Index on user lastLoginAt for activity tracking
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_last_login_at" 
      ON "users" ("last_login_at") 
      WHERE "last_login_at" IS NOT NULL
    `);

    // Composite index for files by user and creation date (for upload stats)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_files_user_id_created_at" 
      ON "files" ("user_id", "created_at") 
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_album_files_album_id_order_index"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_files_user_id_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_files_content_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_download_logs_user_id_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_download_logs_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_role_is_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_last_login_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_files_user_id_created_at"`);
  }
}
