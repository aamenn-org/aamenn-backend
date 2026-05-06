import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContacts1704305000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contacts" (
        "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"             UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "google_contact_id"   TEXT,
        "name_encrypted"      TEXT,
        "phone_encrypted"     TEXT,
        "email_encrypted"     TEXT,
        "created_at"          TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contacts_user_id"
      ON "contacts" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "contacts"`);
  }
}
