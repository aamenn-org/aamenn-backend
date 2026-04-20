import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentTables1774300000000 implements MigrationInterface {
  name = 'CreatePaymentTables1774300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create plans table
    await queryRunner.query(`
      CREATE TABLE "plans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(50) NOT NULL,
        "display_name" varchar(100) NOT NULL,
        "storage_gb" integer NOT NULL,
        "price_egp" decimal(10,2) NOT NULL,
        "price_piasters" integer NOT NULL,
        "duration_days" integer NOT NULL DEFAULT 30,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_plans_name" UNIQUE ("name"),
        CONSTRAINT "PK_plans" PRIMARY KEY ("id")
      )
    `);

    // Create subscriptions table
    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "plan_id" uuid NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "current_period_start" TIMESTAMP NOT NULL,
        "current_period_end" TIMESTAMP NOT NULL,
        "grace_ends_at" TIMESTAMP,
        "paymob_transaction_id" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subscriptions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscriptions_plan" FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_user_status" ON "subscriptions" ("user_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_period_end" ON "subscriptions" ("current_period_end")
    `);

    // Create payments table
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "subscription_id" uuid,
        "plan_id" uuid NOT NULL,
        "amount_piasters" integer NOT NULL,
        "currency" varchar(10) NOT NULL DEFAULT 'EGP',
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "paymob_order_id" varchar,
        "paymob_transaction_id" varchar,
        "paymob_intention_id" varchar,
        "payment_method" varchar(50),
        "failure_reason" text,
        "paid_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payments_plan" FOREIGN KEY ("plan_id") REFERENCES "plans"("id"),
        CONSTRAINT "FK_payments_subscription" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_payment_paymob_transaction" ON "payments" ("paymob_transaction_id") WHERE "paymob_transaction_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_payment_paymob_order" ON "payments" ("paymob_order_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_payment_user" ON "payments" ("user_id")
    `);

    // Seed the 3 storage plans
    await queryRunner.query(`
      INSERT INTO "plans" ("name", "display_name", "storage_gb", "price_egp", "price_piasters", "duration_days")
      VALUES
        ('sentinel', 'Sentinel', 100, 50.00, 5000, 30),
        ('guardian', 'Guardian', 500, 200.00, 20000, 30),
        ('foundation', 'Foundation', 1024, 350.00, 35000, 30)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_paymob_order"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payment_paymob_transaction"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_subscription_period_end"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_subscription_user_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plans"`);
  }
}
