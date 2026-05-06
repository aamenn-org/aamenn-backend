import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddDownloadLogs1704154400000 implements MigrationInterface {
  name = 'AddDownloadLogs1704154400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create download_logs table
    await queryRunner.createTable(
      new Table({
        name: 'download_logs',
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
            name: 'file_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'size_bytes',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'download_type',
            type: 'varchar',
            length: '20',
            default: "'original'",
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            name: 'FK_download_logs_user',
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            name: 'FK_download_logs_file',
            columnNames: ['file_id'],
            referencedTableName: 'files',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // Create indexes for efficient querying
    await queryRunner.createIndex(
      'download_logs',
      new TableIndex({
        name: 'IDX_download_logs_user_created',
        columnNames: ['user_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'download_logs',
      new TableIndex({
        name: 'IDX_download_logs_created',
        columnNames: ['created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('download_logs', 'IDX_download_logs_created');
    await queryRunner.dropIndex(
      'download_logs',
      'IDX_download_logs_user_created',
    );
    await queryRunner.dropTable('download_logs');
  }
}
