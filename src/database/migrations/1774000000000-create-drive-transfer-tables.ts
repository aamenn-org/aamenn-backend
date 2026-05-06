import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriveTransferTables1774000000000 implements MigrationInterface {
  name = 'CreateDriveTransferTables1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "drive_transfer_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'scanning',
        "selected_types" jsonb NOT NULL DEFAULT '[]',
        "include_shared" boolean NOT NULL DEFAULT false,
        "total_items" integer NOT NULL DEFAULT 0,
        "total_bytes" bigint NOT NULL DEFAULT 0,
        "transferred_items" integer NOT NULL DEFAULT 0,
        "transferred_bytes" bigint NOT NULL DEFAULT 0,
        "failed_items" integer NOT NULL DEFAULT 0,
        "skipped_items" integer NOT NULL DEFAULT 0,
        "scan_data" jsonb,
        "folder_map" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_drive_transfer_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_drive_transfer_jobs_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_drive_transfer_jobs_user_status"
        ON "drive_transfer_jobs" ("user_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "drive_transfer_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "job_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "drive_file_id" character varying(100) NOT NULL,
        "drive_name" text NOT NULL,
        "drive_mime_type" character varying(255),
        "drive_size_bytes" bigint NOT NULL DEFAULT 0,
        "drive_parent_id" character varying(100),
        "is_folder" boolean NOT NULL DEFAULT false,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "aamenn_file_id" uuid,
        "aamenn_folder_id" uuid,
        "drive_folder_path" text,
        "retries" integer NOT NULL DEFAULT 0,
        "error_message" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_drive_transfer_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_drive_transfer_items_job" FOREIGN KEY ("job_id")
          REFERENCES "drive_transfer_jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_drive_transfer_items_job_status"
        ON "drive_transfer_items" ("job_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_drive_transfer_items_user"
        ON "drive_transfer_items" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_drive_transfer_items_job_parent"
        ON "drive_transfer_items" ("job_id", "drive_parent_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_drive_transfer_items_job_parent"`);
    await queryRunner.query(`DROP INDEX "IDX_drive_transfer_items_user"`);
    await queryRunner.query(`DROP INDEX "IDX_drive_transfer_items_job_status"`);
    await queryRunner.query(`DROP TABLE "drive_transfer_items"`);
    await queryRunner.query(`DROP INDEX "IDX_drive_transfer_jobs_user_status"`);
    await queryRunner.query(`DROP TABLE "drive_transfer_jobs"`);
  }
}
