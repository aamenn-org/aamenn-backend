import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1704153600000 implements MigrationInterface {
  name = 'InitialSchema1704153600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" TEXT UNIQUE NOT NULL,
        "auth_provider_id" TEXT UNIQUE NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Create user_security table
    await queryRunner.query(`
      CREATE TABLE "user_security" (
        "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "password_salt" TEXT NOT NULL,
        "kdf_params" JSONB NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Create files table
    await queryRunner.query(`
      CREATE TABLE "files" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "b2_file_path" TEXT NOT NULL,
        "cipher_file_key" TEXT NOT NULL,
        "file_name_encrypted" TEXT NOT NULL,
        "mime_type" TEXT,
        "size_bytes" BIGINT,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP
      )
    `);

    // Create index on files
    await queryRunner.query(`
      CREATE INDEX "IDX_files_user_deleted" ON "files" ("user_id", "deleted_at")
    `);

    // Create albums table
    await queryRunner.query(`
      CREATE TABLE "albums" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title_encrypted" TEXT NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Create index on albums
    await queryRunner.query(`
      CREATE INDEX "IDX_albums_user" ON "albums" ("user_id")
    `);

    // Create album_files junction table
    await queryRunner.query(`
      CREATE TABLE "album_files" (
        "album_id" UUID NOT NULL REFERENCES "albums"("id") ON DELETE CASCADE,
        "file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
        "order_index" INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY ("album_id", "file_id")
      )
    `);

    // Create index on album_files
    await queryRunner.query(`
      CREATE INDEX "IDX_album_files_order" ON "album_files" ("album_id", "order_index")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "album_files"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "albums"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "files"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_security"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
