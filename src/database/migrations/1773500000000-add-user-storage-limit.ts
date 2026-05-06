import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserStorageLimit1773500000000 implements MigrationInterface {
  name = 'AddUserStorageLimit1773500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "storage_limit_gb" integer NOT NULL DEFAULT 4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "storage_limit_gb"
    `);
  }
}
