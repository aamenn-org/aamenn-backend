import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class EnhanceContactsFields1704310000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns to contacts table
    const newColumns = [
      new TableColumn({
        name: 'nickname_encrypted',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'address_encrypted',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'organization_encrypted',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'occupation_encrypted',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'birthday_encrypted',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'bio_encrypted',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'urls_encrypted',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'photo_url_encrypted',
        type: 'text',
        isNullable: true,
      }),
    ];

    for (const column of newColumns) {
      await queryRunner.addColumn('contacts', column);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns in reverse order
    const columnsToRemove = [
      'photo_url_encrypted',
      'urls_encrypted',
      'bio_encrypted',
      'birthday_encrypted',
      'occupation_encrypted',
      'organization_encrypted',
      'address_encrypted',
      'nickname_encrypted',
    ];

    for (const columnName of columnsToRemove) {
      await queryRunner.dropColumn('contacts', columnName);
    }
  }
}
