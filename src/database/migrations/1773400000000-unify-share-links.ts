import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnifyShareLinks1773400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add the new unified items column (nullable to allow backfill)
    await queryRunner.query(`
      ALTER TABLE share_links ADD COLUMN IF NOT EXISTS items jsonb;
    `);

    // 2. Backfill existing rows from resource_type + resource_id
    //    Handles both old enum names (share_resource_type / share_links_resource_type_enum)
    await queryRunner.query(`
      UPDATE share_links
      SET items = jsonb_build_array(
        jsonb_build_object(
          'type', resource_type::text,
          'id',   resource_id::text
        )
      )
      WHERE items IS NULL
        AND resource_type IS NOT NULL
        AND resource_id IS NOT NULL;
    `);

    // 3. Set a fallback for any row that somehow still has items = NULL
    await queryRunner.query(`
      UPDATE share_links
      SET items = '[]'::jsonb
      WHERE items IS NULL;
    `);

    // 4. Make the column NOT NULL
    await queryRunner.query(`
      ALTER TABLE share_links ALTER COLUMN items SET NOT NULL;
    `);

    // 5. Drop the old resource columns
    await queryRunner.query(`
      ALTER TABLE share_links
        DROP COLUMN IF EXISTS resource_type,
        DROP COLUMN IF EXISTS resource_id;
    `);

    // 6. Drop the old resource index (if it exists)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_share_links_resource";
    `);

    // 7. Drop the old enum types (both possible names from previous migrations)
    await queryRunner.query(`DROP TYPE IF EXISTS share_links_resource_type_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS share_resource_type;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the enum
    await queryRunner.query(`
      CREATE TYPE share_links_resource_type_enum AS ENUM ('file', 'folder', 'album');
    `);

    // Recreate columns
    await queryRunner.query(`
      ALTER TABLE share_links
        ADD COLUMN IF NOT EXISTS resource_type share_links_resource_type_enum,
        ADD COLUMN IF NOT EXISTS resource_id uuid;
    `);

    // Attempt to restore from items (first element only — best-effort)
    await queryRunner.query(`
      UPDATE share_links
      SET
        resource_type = (items->0->>'type')::share_links_resource_type_enum,
        resource_id   = (items->0->>'id')::uuid
      WHERE jsonb_array_length(items) > 0;
    `);

    // Drop the new column
    await queryRunner.query(`
      ALTER TABLE share_links DROP COLUMN IF EXISTS items;
    `);
  }
}
