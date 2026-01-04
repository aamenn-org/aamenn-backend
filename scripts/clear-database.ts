import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

async function clearDatabase() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME || 'aamenn_vault',
    entities: ['src/database/entities/*.entity.ts'],
    migrations: ['src/database/migrations/*.ts'],
    synchronize: false,
  });

  try {
    console.log('🔄 Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Connected to database');

    // Get all table names
    const tables = await dataSource.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public'
    `);

    if (tables.length === 0) {
      console.log('⚠️  No tables found in database');
      await dataSource.destroy();
      return;
    }

    console.log(`🗑️  Clearing ${tables.length} tables...`);

    // Disable foreign key checks temporarily
    await dataSource.query('SET session_replication_role = replica;');

    // Truncate all tables
    for (const { tablename } of tables) {
      console.log(`   Clearing table: ${tablename}`);
      await dataSource.query(`TRUNCATE TABLE "${tablename}" CASCADE`);
    }

    // Re-enable foreign key checks
    await dataSource.query('SET session_replication_role = DEFAULT;');

    console.log('✅ Database cleared successfully!');
    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    await dataSource.destroy();
    process.exit(1);
  }
}

clearDatabase();
