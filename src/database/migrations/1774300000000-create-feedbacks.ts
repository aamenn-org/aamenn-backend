import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateFeedbacks1774300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'feedbacks',
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
            name: 'category',
            type: 'varchar',
            length: '50',
            default: "'other'",
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'created_at',
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
      'feedbacks',
      new TableIndex({
        name: 'IDX_feedbacks_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'feedbacks',
      new TableIndex({
        name: 'IDX_feedbacks_category',
        columnNames: ['category'],
      }),
    );

    await queryRunner.createIndex(
      'feedbacks',
      new TableIndex({
        name: 'IDX_feedbacks_created_at',
        columnNames: ['created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('feedbacks', 'IDX_feedbacks_created_at');
    await queryRunner.dropIndex('feedbacks', 'IDX_feedbacks_category');
    await queryRunner.dropIndex('feedbacks', 'IDX_feedbacks_user_id');
    await queryRunner.dropTable('feedbacks');
  }
}
