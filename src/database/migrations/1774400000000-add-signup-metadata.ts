import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignupMetadata1774400000000 implements MigrationInterface {
  name = 'AddSignupMetadata1774400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "signup_ip" varchar(45) DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "signup_fingerprint" varchar(128) DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "signup_flagged" boolean NOT NULL DEFAULT false
    `);

    // Index for fingerprint lookups during abuse detection
    await queryRunner.query(`
      CREATE INDEX "IDX_users_signup_fingerprint"
      ON "users" ("signup_fingerprint")
      WHERE "signup_fingerprint" IS NOT NULL
    `);

    // Index for admin queries on flagged users
    await queryRunner.query(`
      CREATE INDEX "IDX_users_signup_flagged"
      ON "users" ("signup_flagged")
      WHERE "signup_flagged" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_signup_flagged"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_signup_fingerprint"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "signup_flagged"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "signup_fingerprint"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "signup_ip"`);
  }
}
