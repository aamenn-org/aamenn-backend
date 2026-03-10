import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddShareLinkMetadata1773100100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'share_links',
      new TableColumn({
        name: 'metadata',
        type: 'jsonb',
        isNullable: true,
        default: null,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('share_links', 'metadata');
  }
}
