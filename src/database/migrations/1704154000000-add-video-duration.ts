import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddVideoDuration1704154000000 implements MigrationInterface {
  name = 'AddVideoDuration1704154000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'files',
      new TableColumn({
        name: 'duration',
        type: 'integer',
        isNullable: true,
        comment: 'Video duration in seconds',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('files', 'duration');
  }
}
