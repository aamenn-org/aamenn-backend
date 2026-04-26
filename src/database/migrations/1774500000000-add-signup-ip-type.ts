import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignupIpType1774500000000 implements MigrationInterface {
  name = 'AddSignupIpType1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "signup_ip_type" varchar(20) DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "signup_ip_type"`);
  }
}
