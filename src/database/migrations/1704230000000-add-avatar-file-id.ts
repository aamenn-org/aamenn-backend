import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarFileId1704230000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "avatar_file_id" uuid
    `);
    
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "fk_users_avatar_file"
      FOREIGN KEY ("avatar_file_id") REFERENCES "files" ("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "fk_users_avatar_file"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "avatar_file_id"
    `);
  }
}
