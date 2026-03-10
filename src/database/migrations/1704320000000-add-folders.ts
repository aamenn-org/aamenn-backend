import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey, TableColumn } from 'typeorm';

export class AddFolders1704320000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create folders table
    await queryRunner.createTable(
      new Table({
        name: 'folders',
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
            name: 'parent_folder_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'name_encrypted',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Add indexes on folders
    await queryRunner.createIndex(
      'folders',
      new TableIndex({
        name: 'IDX_folders_user_parent_deleted',
        columnNames: ['user_id', 'parent_folder_id', 'deleted_at'],
      }),
    );

    await queryRunner.createIndex(
      'folders',
      new TableIndex({
        name: 'IDX_folders_user_deleted',
        columnNames: ['user_id', 'deleted_at'],
      }),
    );

    // Add foreign keys on folders
    await queryRunner.createForeignKey(
      'folders',
      new TableForeignKey({
        name: 'FK_folders_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'folders',
      new TableForeignKey({
        name: 'FK_folders_parent',
        columnNames: ['parent_folder_id'],
        referencedTableName: 'folders',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // Add folder_id column to files table
    await queryRunner.addColumn(
      'files',
      new TableColumn({
        name: 'folder_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // Add index on files.folder_id
    await queryRunner.createIndex(
      'files',
      new TableIndex({
        name: 'IDX_files_user_folder_deleted',
        columnNames: ['user_id', 'folder_id', 'deleted_at'],
      }),
    );

    // Add foreign key from files to folders
    await queryRunner.createForeignKey(
      'files',
      new TableForeignKey({
        name: 'FK_files_folder',
        columnNames: ['folder_id'],
        referencedTableName: 'folders',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove FK from files
    await queryRunner.dropForeignKey('files', 'FK_files_folder');

    // Remove index on files.folder_id
    await queryRunner.dropIndex('files', 'IDX_files_user_folder_deleted');

    // Remove folder_id column from files
    await queryRunner.dropColumn('files', 'folder_id');

    // Drop folders table (cascades FKs and indexes)
    await queryRunner.dropTable('folders', true);
  }
}
