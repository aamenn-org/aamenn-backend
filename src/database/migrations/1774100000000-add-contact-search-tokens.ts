import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactSearchTokens1774100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS search_tokens text[] NOT NULL DEFAULT '{}'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_search_tokens
      ON contacts USING GIN (search_tokens)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contacts_search_tokens`);
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS search_tokens`);
  }
}
