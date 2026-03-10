import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGoogleRefreshToken1773095089206 implements MigrationInterface {
    name = 'AddGoogleRefreshToken1773095089206'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "files" DROP CONSTRAINT "FK_files_video_stream"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "fk_users_avatar_file"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_album_files_album_id_order_index"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_files_user_id_deleted_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_files_content_hash"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_files_user_id_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_files_video_stream"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_role_is_active"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_last_login_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_share_links_owner_created"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_share_links_resource"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_share_links_expires_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_token_hash"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_user_id_is_revoked"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_download_logs_user_id_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_download_logs_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_CONTACTS_GOOGLE_ID"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_CONTACTS_USER_ID"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_CONTACTS_PHONE"`);
        await queryRunner.query(`ALTER TABLE "files" DROP COLUMN "cipher_thumb_small_key"`);
        await queryRunner.query(`ALTER TABLE "files" DROP COLUMN "cipher_thumb_medium_key"`);
        await queryRunner.query(`ALTER TABLE "files" DROP COLUMN "blurhash"`);
        await queryRunner.query(`ALTER TABLE "files" DROP COLUMN "cipher_thumb_large_key"`);
        await queryRunner.query(`ALTER TABLE "files" DROP COLUMN "video_stream_id"`);
        await queryRunner.query(`ALTER TABLE "files" DROP COLUMN "storage_layout"`);
        await queryRunner.query(`ALTER TABLE "files" DROP COLUMN "b2_manifest_path"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "last_sync_at"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "google_refresh_token" text`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."trash_retention_days" IS NULL`);
        await queryRunner.query(`ALTER TYPE "public"."share_resource_type" RENAME TO "share_resource_type_old"`);
        await queryRunner.query(`CREATE TYPE "public"."share_links_resource_type_enum" AS ENUM('file', 'album')`);
        await queryRunner.query(`ALTER TABLE "share_links" ALTER COLUMN "resource_type" TYPE "public"."share_links_resource_type_enum" USING "resource_type"::"text"::"public"."share_links_resource_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."share_resource_type_old"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "created_at" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "google_contact_id"`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "google_contact_id" character varying`);
        await queryRunner.query(`ALTER TABLE "contacts" ALTER COLUMN "created_at" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "contacts" ALTER COLUMN "updated_at" SET DEFAULT now()`);
        await queryRunner.query(`CREATE INDEX "IDX_ea30055665f2fee9e3df4814fa" ON "share_links" ("expires_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_dfdbaf66cf64f42ac70688d799" ON "share_links" ("resource_type", "resource_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_40cde31c388a870f0ce9d6da9a" ON "share_links" ("owner_user_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens" ("token_hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_14187aa4d2d58318c82c62c7ea" ON "refresh_tokens" ("user_id", "is_revoked") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_14187aa4d2d58318c82c62c7ea"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a7838d2ba25be1342091b6695f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_40cde31c388a870f0ce9d6da9a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dfdbaf66cf64f42ac70688d799"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ea30055665f2fee9e3df4814fa"`);
        await queryRunner.query(`ALTER TABLE "contacts" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "contacts" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "google_contact_id"`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "google_contact_id" text`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`CREATE TYPE "public"."share_resource_type_old" AS ENUM('file', 'album')`);
        await queryRunner.query(`ALTER TABLE "share_links" ALTER COLUMN "resource_type" TYPE "public"."share_resource_type_old" USING "resource_type"::"text"::"public"."share_resource_type_old"`);
        await queryRunner.query(`DROP TYPE "public"."share_links_resource_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."share_resource_type_old" RENAME TO "share_resource_type"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."trash_retention_days" IS 'Number of days to retain files in trash before automatic permanent deletion'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "google_refresh_token"`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "last_sync_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "files" ADD "b2_manifest_path" text`);
        await queryRunner.query(`ALTER TABLE "files" ADD "storage_layout" character varying(30) NOT NULL DEFAULT 'single_blob'`);
        await queryRunner.query(`ALTER TABLE "files" ADD "video_stream_id" uuid`);
        await queryRunner.query(`ALTER TABLE "files" ADD "cipher_thumb_large_key" text`);
        await queryRunner.query(`ALTER TABLE "files" ADD "blurhash" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "files" ADD "cipher_thumb_medium_key" text`);
        await queryRunner.query(`ALTER TABLE "files" ADD "cipher_thumb_small_key" text`);
        await queryRunner.query(`CREATE INDEX "IDX_CONTACTS_PHONE" ON "contacts" ("phone_encrypted") `);
        await queryRunner.query(`CREATE INDEX "IDX_CONTACTS_USER_ID" ON "contacts" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_CONTACTS_GOOGLE_ID" ON "contacts" ("google_contact_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_download_logs_created_at" ON "download_logs" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_download_logs_user_id_created_at" ON "download_logs" ("user_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_user_id_is_revoked" ON "refresh_tokens" ("user_id", "is_revoked") `);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_share_links_expires_at" ON "share_links" ("expires_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_share_links_resource" ON "share_links" ("resource_type", "resource_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_share_links_owner_created" ON "share_links" ("owner_user_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_users_last_login_at" ON "users" ("last_login_at") WHERE (last_login_at IS NOT NULL)`);
        await queryRunner.query(`CREATE INDEX "IDX_users_role_is_active" ON "users" ("role", "is_active") `);
        await queryRunner.query(`CREATE INDEX "IDX_files_video_stream" ON "files" ("video_stream_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_files_user_id_created_at" ON "files" ("user_id", "created_at") WHERE (deleted_at IS NULL)`);
        await queryRunner.query(`CREATE INDEX "IDX_files_content_hash" ON "files" ("content_hash") WHERE (content_hash IS NOT NULL)`);
        await queryRunner.query(`CREATE INDEX "IDX_files_user_id_deleted_at" ON "files" ("user_id", "deleted_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_album_files_album_id_order_index" ON "album_files" ("album_id", "order_index") `);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "fk_users_avatar_file" FOREIGN KEY ("avatar_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "files" ADD CONSTRAINT "FK_files_video_stream" FOREIGN KEY ("video_stream_id") REFERENCES "video_streams"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
