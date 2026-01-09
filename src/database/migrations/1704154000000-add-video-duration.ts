import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoDuration1704154000000 implements MigrationInterface {
  name = 'AddVideoDuration1704154000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add duration column (if not exists)
    await queryRunner.query(`
      ALTER TABLE "files" 
      ADD COLUMN IF NOT EXISTS "duration" INTEGER
    `);

    // Add comment
    await queryRunner.query(`
      COMMENT ON COLUMN "files"."duration" IS 'Video duration in seconds'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('files', 'duration');
  }
}
