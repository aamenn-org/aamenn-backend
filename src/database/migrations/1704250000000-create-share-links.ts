import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateShareLinks1704250000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for resource_type
    await queryRunner.query(`
      CREATE TYPE share_resource_type AS ENUM ('file', 'album');
    `);

    // Create share_links table
    await queryRunner.createTable(
      new Table({
        name: 'share_links',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'slug',
            type: 'text',
            isUnique: true,
          },
          {
            name: 'owner_user_id',
            type: 'uuid',
          },
          {
            name: 'resource_type',
            type: 'share_resource_type',
          },
          {
            name: 'resource_id',
            type: 'uuid',
          },
          {
            name: 'share_key',
            type: 'text',
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'revoked_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'share_links',
      new TableIndex({
        name: 'IDX_share_links_owner_created',
        columnNames: ['owner_user_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'share_links',
      new TableIndex({
        name: 'IDX_share_links_resource',
        columnNames: ['resource_type', 'resource_id'],
      }),
    );

    await queryRunner.createIndex(
      'share_links',
      new TableIndex({
        name: 'IDX_share_links_expires_at',
        columnNames: ['expires_at'],
      }),
    );

    // Create foreign key to users table
    await queryRunner.createForeignKey(
      'share_links',
      new TableForeignKey({
        columnNames: ['owner_user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop table (foreign keys and indexes are dropped automatically)
    await queryRunner.dropTable('share_links');

    // Drop enum type
    await queryRunner.query(`DROP TYPE share_resource_type;`);
  }
}
