import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInstapayPayments1774400000000 implements MigrationInterface {
  name = 'CreateInstapayPayments1774400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "instapay_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "plan_id" uuid NOT NULL,
        "amount_piasters" integer NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'pending_verification',
        "screenshot_b2_path" varchar(500),
        "screenshot_mime_type" varchar(50) NOT NULL,
        "instapay_reference" varchar(100) NOT NULL,
        "sender_name" varchar(100),
        "admin_note" text,
        "reviewed_by" uuid,
        "reviewed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_instapay_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_instapay_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_instapay_plan" FOREIGN KEY ("plan_id") REFERENCES "plans"("id"),
        CONSTRAINT "FK_instapay_reviewer" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_instapay_user_status" ON "instapay_payments" ("user_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_instapay_status_created" ON "instapay_payments" ("status", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_instapay_status_created"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_instapay_user_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "instapay_payments"`);
  }
}
