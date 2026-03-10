import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFolderShareType1773100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE share_links_resource_type_enum ADD VALUE IF NOT EXISTS 'folder';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values directly.
    // To rollback: recreate the enum without 'folder' and update the column.
    await queryRunner.query(`
      ALTER TABLE share_links
        ALTER COLUMN resource_type TYPE text;
    `);
    await queryRunner.query(`DROP TYPE share_links_resource_type_enum;`);
    await queryRunner.query(`
      CREATE TYPE share_links_resource_type_enum AS ENUM ('file', 'album');
    `);
    await queryRunner.query(`
      ALTER TABLE share_links
        ALTER COLUMN resource_type TYPE share_links_resource_type_enum
        USING resource_type::share_links_resource_type_enum;
    `);
  }
}
