import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import B2 = require('backblaze-b2');
import * as fs from 'fs/promises';
import * as path from 'path';

config();

interface MigrationConfig {
  newBucketId: string;
  newBucketName: string;
  newApplicationKeyId: string;
  newApplicationKey: string;
}

interface MigrationState {
  startedAt: string;
  total: number;
  copiedKeys: string[];
  failedKeys: { key: string; error: string }[];
  lastUpdated: string;
}

interface ProgressStats {
  total: number;
  copied: number;
  failed: number;
  currentKey: string;
  startTime: number;
  copiesPerSecond: number;
}

class B2BucketMigration {
  private sourceB2: InstanceType<typeof B2>;
  private destB2: InstanceType<typeof B2>;
  private dataSource: DataSource;
  private state: MigrationState;
  private stateFile: string;
  private concurrency: number;
  private batchSize: number;
  private maxErrors: number;
  private dryRun: boolean;
  private mode: 'copy' | 'verify';

  constructor(
    private config: MigrationConfig,
    private options: {
      stateFile?: string;
      concurrency?: number;
      batchSize?: number;
      maxErrors?: number;
      dryRun?: boolean;
      mode?: 'copy' | 'verify';
    } = {},
  ) {
    this.stateFile = options.stateFile || '.b2-migration-state.json';
    this.concurrency = options.concurrency || 5;
    this.batchSize = options.batchSize || 200;
    this.maxErrors = options.maxErrors || 100;
    this.dryRun = options.dryRun || false;
    this.mode = options.mode || 'copy';
  }

  async initialize() {
    console.log('🔧 Initializing B2 bucket migration...\n');

    // Initialize source B2
    console.log('📡 Connecting to source B2 bucket...');
    this.sourceB2 = new B2({
      applicationKeyId: process.env.B2_APPLICATION_KEY_ID!,
      applicationKey: process.env.B2_APPLICATION_KEY!,
    });
    await this.sourceB2.authorize();
    console.log(`✅ Source bucket: ${process.env.B2_BUCKET_NAME}\n`);

    // Initialize destination B2
    console.log('📡 Connecting to destination B2 bucket...');
    this.destB2 = new B2({
      applicationKeyId: this.config.newApplicationKeyId,
      applicationKey: this.config.newApplicationKey,
    });
    await this.destB2.authorize();
    console.log(`✅ Destination bucket: ${this.config.newBucketName}\n`);

    // Initialize database
    console.log('💾 Connecting to database...');
    this.dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USERNAME || 'postgres',
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME || 'aamenn_vault',
      entities: ['src/database/entities/*.entity.ts'],
      synchronize: false,
    });
    await this.dataSource.initialize();
    console.log('✅ Database connected\n');

    // Load or create state
    await this.loadState();
  }

  private async loadState() {
    try {
      const stateData = await fs.readFile(this.stateFile, 'utf8');
      this.state = JSON.parse(stateData);
      console.log(`📂 Loaded existing state: ${this.state.copiedKeys.length} already copied\n`);
    } catch {
      this.state = {
        startedAt: new Date().toISOString(),
        total: 0,
        copiedKeys: [],
        failedKeys: [],
        lastUpdated: new Date().toISOString(),
      };
      console.log('📝 Starting fresh migration\n');
    }
  }

  private async saveState() {
    this.state.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  private async getAllObjectKeys(): Promise<string[]> {
    console.log('📋 Collecting object keys from database...');

    const files = await this.dataSource.query(`
      SELECT 
        b2_file_path,
        b2_thumb_small_path,
        b2_thumb_medium_path,
        b2_thumb_large_path
      FROM file
      WHERE deleted_at IS NULL
    `);

    const allKeys = new Set<string>();

    for (const file of files) {
      if (file.b2_file_path) allKeys.add(file.b2_file_path);
      if (file.b2_thumb_small_path) allKeys.add(file.b2_thumb_small_path);
      if (file.b2_thumb_medium_path) allKeys.add(file.b2_thumb_medium_path);
      if (file.b2_thumb_large_path) allKeys.add(file.b2_thumb_large_path);
    }

    const keys = Array.from(allKeys);
    console.log(`✅ Found ${keys.length} unique objects to migrate\n`);
    return keys;
  }

  private async copyObject(objectKey: string): Promise<void> {
    if (this.dryRun) {
      console.log(`[DRY RUN] Would copy: ${objectKey}`);
      return;
    }

    // List file in source bucket to get fileId
    const listResponse = await this.sourceB2.listFileNames({
      bucketId: process.env.B2_BUCKET_ID!,
      prefix: objectKey,
      maxFileCount: 1,
    });

    if (listResponse.data.files.length === 0) {
      throw new Error(`Object not found in source bucket: ${objectKey}`);
    }

    const sourceFile = listResponse.data.files[0];

    // Use B2 server-side copy
    await this.destB2.copyFile({
      sourceFileId: sourceFile.fileId,
      destinationBucketId: this.config.newBucketId,
      fileName: objectKey, // Keep same path
    });
  }

  private async verifyObject(objectKey: string): Promise<boolean> {
    try {
      const listResponse = await this.destB2.listFileNames({
        bucketId: this.config.newBucketId,
        prefix: objectKey,
        maxFileCount: 1,
      });

      return listResponse.data.files.length > 0 && 
             listResponse.data.files[0].fileName === objectKey;
    } catch {
      return false;
    }
  }

  private formatProgress(stats: ProgressStats): string {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const percentage = ((stats.copied + stats.failed) / stats.total * 100).toFixed(2);
    const remaining = stats.total - stats.copied - stats.failed;
    const eta = remaining > 0 && stats.copiesPerSecond > 0
      ? Math.ceil(remaining / stats.copiesPerSecond)
      : 0;

    const etaStr = eta > 0 ? `${Math.floor(eta / 60)}m ${eta % 60}s` : 'calculating...';

    return [
      `\n${'='.repeat(60)}`,
      `Progress: ${stats.copied + stats.failed}/${stats.total} (${percentage}%)`,
      `✅ Copied: ${stats.copied}`,
      `❌ Failed: ${stats.failed}`,
      `⏱️  Speed: ${stats.copiesPerSecond.toFixed(2)} objects/sec`,
      `⏳ ETA: ${etaStr}`,
      `📄 Current: ${stats.currentKey.substring(0, 50)}...`,
      `${'='.repeat(60)}\n`,
    ].join('\n');
  }

  async migrate() {
    const allKeys = await this.getAllObjectKeys();
    this.state.total = allKeys.length;

    // Filter out already copied keys
    const copiedSet = new Set(this.state.copiedKeys);
    const pendingKeys = allKeys.filter(key => !copiedSet.has(key));

    if (pendingKeys.length === 0) {
      console.log('✅ All objects already migrated!\n');
      return;
    }

    console.log(`🚀 Starting ${this.mode} mode...`);
    console.log(`📦 Objects to process: ${pendingKeys.length}`);
    console.log(`🔄 Concurrency: ${this.concurrency}`);
    console.log(`${this.dryRun ? '🔍 DRY RUN MODE\n' : ''}`);

    const stats: ProgressStats = {
      total: allKeys.length,
      copied: this.state.copiedKeys.length,
      failed: this.state.failedKeys.length,
      currentKey: '',
      startTime: Date.now(),
      copiesPerSecond: 0,
    };

    let lastProgressUpdate = Date.now();
    const progressInterval = 2000; // Update every 2 seconds

    // Process in batches with concurrency control
    for (let i = 0; i < pendingKeys.length; i += this.batchSize) {
      const batch = pendingKeys.slice(i, i + this.batchSize);
      const promises: Promise<void>[] = [];

      for (let j = 0; j < batch.length; j += this.concurrency) {
        const chunk = batch.slice(j, j + this.concurrency);

        const chunkPromises = chunk.map(async (key) => {
          stats.currentKey = key;

          try {
            if (this.mode === 'copy') {
              await this.copyObject(key);
            } else {
              const exists = await this.verifyObject(key);
              if (!exists) {
                throw new Error('Object not found in destination');
              }
            }

            this.state.copiedKeys.push(key);
            stats.copied++;

            // Calculate speed (exponential moving average)
            const elapsed = (Date.now() - stats.startTime) / 1000;
            stats.copiesPerSecond = stats.copied / elapsed;
          } catch (error: any) {
            this.state.failedKeys.push({
              key,
              error: error.message || 'Unknown error',
            });
            stats.failed++;

            if (this.state.failedKeys.length >= this.maxErrors) {
              throw new Error(`Max errors (${this.maxErrors}) reached. Stopping migration.`);
            }
          }

          // Show progress periodically
          if (Date.now() - lastProgressUpdate > progressInterval) {
            console.clear();
            console.log(this.formatProgress(stats));
            lastProgressUpdate = Date.now();
          }
        });

        promises.push(...chunkPromises);
        await Promise.all(chunkPromises);
      }

      // Save state after each batch
      await this.saveState();
    }

    // Final progress
    console.clear();
    console.log(this.formatProgress(stats));

    // Summary
    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successfully ${this.mode === 'copy' ? 'copied' : 'verified'}: ${stats.copied}`);
    console.log(`❌ Failed: ${stats.failed}`);

    if (this.state.failedKeys.length > 0) {
      console.log('\n❌ Failed objects (first 10):');
      this.state.failedKeys.slice(0, 10).forEach(({ key, error }) => {
        console.log(`  - ${key}: ${error}`);
      });
      console.log(`\n💾 Full error list saved to: ${this.stateFile}`);
    }

    await this.saveState();
  }

  async cleanup() {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}

// CLI argument parsing
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg?.split('=')[1];
  };
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  try {
    // Parse arguments
    const newBucketId = getArg('newBucketId');
    const newBucketName = getArg('newBucketName');
    const configFile = getArg('configFile');
    const mode = (getArg('mode') || 'copy') as 'copy' | 'verify';
    const dryRun = hasFlag('dryRun');
    const concurrency = parseInt(getArg('concurrency') || '5', 10);
    const batchSize = parseInt(getArg('batchSize') || '200', 10);
    const maxErrors = parseInt(getArg('maxErrors') || '100', 10);
    const stateFile = getArg('stateFile') || '.b2-migration-state.json';

    // Validate required args
    if (!newBucketId || !newBucketName) {
      console.error('❌ Error: --newBucketId and --newBucketName are required\n');
      console.log('Usage:');
      console.log('  npm run migrate:b2:bucket -- --newBucketId=XXX --newBucketName=YYY [options]\n');
      console.log('Options:');
      console.log('  --configFile=/path/to/config.json  (secure: contains newApplicationKeyId, newApplicationKey)');
      console.log('  --mode=copy|verify                 (default: copy)');
      console.log('  --dryRun                           (test without copying)');
      console.log('  --concurrency=5                    (parallel operations)');
      console.log('  --batchSize=200                    (objects per batch)');
      console.log('  --maxErrors=100                    (stop after N errors)');
      console.log('  --stateFile=path.json              (resume support)\n');
      console.log('Credentials (choose one):');
      console.log('  1) --configFile=/secure/path.json');
      console.log('  2) Environment variables: B2_NEW_APPLICATION_KEY_ID, B2_NEW_APPLICATION_KEY\n');
      process.exit(1);
    }

    // Load credentials
    let newApplicationKeyId: string;
    let newApplicationKey: string;

    if (configFile) {
      console.log(`🔐 Loading credentials from: ${configFile}`);
      const configData = await fs.readFile(configFile, 'utf8');
      const config = JSON.parse(configData);
      newApplicationKeyId = config.newApplicationKeyId;
      newApplicationKey = config.newApplicationKey;
    } else {
      newApplicationKeyId = process.env.B2_NEW_APPLICATION_KEY_ID!;
      newApplicationKey = process.env.B2_NEW_APPLICATION_KEY!;
    }

    if (!newApplicationKeyId || !newApplicationKey) {
      console.error('❌ Error: Destination B2 credentials not provided\n');
      console.error('Provide either:');
      console.error('  --configFile with newApplicationKeyId and newApplicationKey');
      console.error('  or environment variables B2_NEW_APPLICATION_KEY_ID and B2_NEW_APPLICATION_KEY\n');
      process.exit(1);
    }

    // Run migration
    const migration = new B2BucketMigration(
      {
        newBucketId,
        newBucketName,
        newApplicationKeyId,
        newApplicationKey,
      },
      {
        stateFile,
        concurrency,
        batchSize,
        maxErrors,
        dryRun,
        mode,
      },
    );

    await migration.initialize();
    await migration.migrate();
    await migration.cleanup();

    console.log('\n✅ Migration completed successfully!\n');
    
    if (mode === 'copy' && !dryRun) {
      console.log('📋 Next steps:');
      console.log('1. Run verification: npm run migrate:b2:bucket -- --newBucketId=XXX --newBucketName=YYY --mode=verify');
      console.log('2. Update .env file:');
      console.log(`   B2_BUCKET_ID=${newBucketId}`);
      console.log(`   B2_BUCKET_NAME=${newBucketName}`);
      console.log(`   B2_APPLICATION_KEY_ID=${newApplicationKeyId}`);
      console.log('3. Restart application: docker compose up -d --force-recreate\n');
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
