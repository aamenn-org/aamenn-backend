import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatePlansPricing1774500000000 implements MigrationInterface {
  name = 'UpdatePlansPricing1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Insert / upsert the new plan tiers.
    await queryRunner.query(`
      INSERT INTO "plans" ("name", "display_name", "storage_gb", "price_egp", "price_piasters", "duration_days", "is_active")
      VALUES
        ('starter',  'Starter',  8,    7.00,    700,   30, true),
        ('basic',    'Basic',    16,   13.00,   1300,  30, true),
        ('plus',     'Plus',     32,   25.00,   2500,  30, true),
        ('pro',      'Pro',      64,   49.00,   4900,  30, true),
        ('premium',  'Premium',  128,  99.00,   9900,  30, true),
        ('elite',    'Elite',    256,  195.00,  19500, 30, true),
        ('ultra',    'Ultra',    512,  390.00,  39000, 30, true),
        ('max',      'Max',      1024, 600.00,  60000, 30, true),
        ('titan',    'Titan',    2048, 900.00,  90000, 30, true)
      ON CONFLICT ("name") DO UPDATE SET
        "display_name"   = EXCLUDED."display_name",
        "storage_gb"     = EXCLUDED."storage_gb",
        "price_egp"      = EXCLUDED."price_egp",
        "price_piasters" = EXCLUDED."price_piasters",
        "duration_days"  = EXCLUDED."duration_days",
        "is_active"      = true,
        "updated_at"     = NOW()
    `);

    // 2. Reassign any existing subscription/payment references from the old
    //    legacy plans to their closest new equivalent. We can't keep the legacy
    //    rows around because the admin UI lists every plan in the table and
    //    they should not appear there. Reassignment preserves the FK linkage
    //    and historical billing rows (amount_piasters on payments is fixed at
    //    payment time, so financial history is unchanged).
    //
    //    sentinel  (120 GB / EGP 55)  -> premium (128 GB / EGP 99)
    //    guardian  (500 GB / EGP 200) -> ultra   (512 GB / EGP 390)
    //    foundation(1 TB  / EGP 350)  -> max     (1 TB  / EGP 600)
    const remap: Array<[string, string]> = [
      ['sentinel', 'premium'],
      ['guardian', 'ultra'],
      ['foundation', 'max'],
    ];

    for (const [oldName, newName] of remap) {
      await queryRunner.query(
        `
        UPDATE "subscriptions"
        SET "plan_id" = (SELECT id FROM "plans" WHERE name = $2)
        WHERE "plan_id" = (SELECT id FROM "plans" WHERE name = $1)
        `,
        [oldName, newName],
      );
      await queryRunner.query(
        `
        UPDATE "payments"
        SET "plan_id" = (SELECT id FROM "plans" WHERE name = $2)
        WHERE "plan_id" = (SELECT id FROM "plans" WHERE name = $1)
        `,
        [oldName, newName],
      );
      // instapay_payments table only exists after migration 1774400000000
      const hasInstapay = await queryRunner.query(
        `SELECT 1 FROM "information_schema"."tables" WHERE "table_name" = 'instapay_payments'`,
      );
      if (hasInstapay.length > 0) {
        await queryRunner.query(
          `
          UPDATE "instapay_payments"
          SET "plan_id" = (SELECT id FROM "plans" WHERE name = $2)
          WHERE "plan_id" = (SELECT id FROM "plans" WHERE name = $1)
          `,
          [oldName, newName],
        );
      }
    }

    // 3. Now safe to hard-delete the legacy plan rows.
    await queryRunner.query(`
      DELETE FROM "plans"
      WHERE "name" IN ('sentinel', 'guardian', 'foundation')
    `);

    // 4. Lower the default storage limit for new users from 5 GB to 4 GB.
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "storage_limit_gb" SET DEFAULT 4
    `);

    // 5. Downgrade existing free-tier users (those still on the previous 5 GB
    //    default and without an active paid subscription) to the new 4 GB tier.
    await queryRunner.query(`
      UPDATE "users" u
      SET "storage_limit_gb" = 4
      WHERE u."storage_limit_gb" = 5
        AND NOT EXISTS (
          SELECT 1 FROM "subscriptions" s
          WHERE s."user_id" = u."id"
            AND s."status" IN ('active', 'grace')
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the previous default and the legacy plan rows. We cannot restore
    // which subscription/payment row used to point at which legacy plan, but
    // the rows themselves are recreated so the names exist again.
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "storage_limit_gb" SET DEFAULT 5
    `);

    await queryRunner.query(`
      INSERT INTO "plans" ("name", "display_name", "storage_gb", "price_egp", "price_piasters", "duration_days", "is_active")
      VALUES
        ('sentinel',   'Sentinel',   100,  50.00,  5000,  30, true),
        ('guardian',   'Guardian',   500,  200.00, 20000, 30, true),
        ('foundation', 'Foundation', 1024, 350.00, 35000, 30, true)
      ON CONFLICT ("name") DO NOTHING
    `);

    await queryRunner.query(`
      DELETE FROM "plans"
      WHERE "name" IN ('starter','basic','plus','pro','premium','elite','ultra','max','titan')
    `);
  }
}
