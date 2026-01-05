import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME || 'aamenn_vault',
  entities: ['dist/src/database/entities/*.entity.js'],
  migrations: ['dist/src/database/migrations/*.js'],
  synchronize: false,
});

async function runMigrations() {
  try {
    console.log('Initializing data source...');
    await AppDataSource.initialize();
    
    console.log('Running pending migrations...');
    const migrations = await AppDataSource.runMigrations();
    
    if (migrations.length > 0) {
      console.log(`Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach(m => console.log(`  - ${m.name}`));
    } else {
      console.log('No pending migrations to run.');
    }
    
    await AppDataSource.destroy();
    console.log('Migration process completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
