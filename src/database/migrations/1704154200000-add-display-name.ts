import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDisplayName1704154200000 implements MigrationInterface {
  name = 'AddDisplayName1704154200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'display_name',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'display_name');
  }
}
