import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGoogleAccessTokenFields1704300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if google_access_token column exists, if not add it
    const googleAccessTokenColumn = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'google_access_token'
    `);

    if (googleAccessTokenColumn.length === 0) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'google_access_token',
          type: 'text',
          isNullable: true,
        }),
      );
    }

    // Check if google_token_expires_at column exists, if not add it
    const googleTokenExpiresAtColumn = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'google_token_expires_at'
    `);

    if (googleTokenExpiresAtColumn.length === 0) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'google_token_expires_at',
          type: 'timestamp',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'google_token_expires_at');
    await queryRunner.dropColumn('users', 'google_access_token');
  }
}
