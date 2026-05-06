import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUploadSessions1773300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'upload_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'b2_file_id',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'b2_file_path',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'file_name_encrypted',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'cipher_file_key',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'mime_type',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'total_bytes',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'total_parts',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'chunk_size_bytes',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'completed_parts',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'active'",
          },
          {
            name: 'content_hash',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'folder_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'width',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'height',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'duration',
            type: 'integer',
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
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'upload_sessions',
      new TableIndex({
        name: 'IDX_upload_sessions_user_status',
        columnNames: ['user_id', 'status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('upload_sessions', 'IDX_upload_sessions_user_status');
    await queryRunner.dropTable('upload_sessions');
  }
}
