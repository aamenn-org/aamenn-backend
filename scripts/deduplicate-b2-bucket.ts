import { config } from 'dotenv';
import B2 = require('backblaze-b2');
import * as fs from 'fs/promises';
import * as path from 'path';

config();

interface FileVersion {
  fileId: string;
  fileName: string;
  uploadTimestamp: number;
  size: number;
  action: string;
}

interface DuplicateGroup {
  fileName: string;
  versions: FileVersion[];
  toKeep: FileVersion;
  toDelete: FileVersion[];
}

interface DeduplicationStats {
  totalFiles: number;
  uniqueFiles: number;
  duplicateGroups: number;
  filesToDelete: number;
  storageToFree: number;
}

interface DeletedFileLog {
  fileId: string;
  fileName: string;
  size: number;
  uploadTimestamp: number;
  deletedAt: string;
}

class B2Deduplicator {
  private b2: InstanceType<typeof B2>;
  private bucketId: string;
  private bucketName: string;
  private dryRun: boolean;
  private logFile: string;
  private deletedFiles: DeletedFileLog[] = [];

  constructor(
    bucketId: string,
    bucketName: string,
    options: {
      dryRun?: boolean;
      logFile?: string;
    } = {},
  ) {
    this.bucketId = bucketId;
    this.bucketName = bucketName;
    this.dryRun = options.dryRun !== false; // Default to true
    this.logFile = options.logFile || '.b2-deduplication-log.json';
  }

  async initialize() {
    console.log('🔧 Initializing B2 deduplicator...\n');

    this.b2 = new B2({
      applicationKeyId: process.env.B2_APPLICATION_KEY_ID!,
      applicationKey: process.env.B2_APPLICATION_KEY!,
    });

    await this.b2.authorize();
    console.log(`✅ Connected to B2`);
    console.log(`📦 Bucket: ${this.bucketName} (${this.bucketId})`);
    console.log(`${this.dryRun ? '🔍 DRY RUN MODE - No files will be deleted\n' : '⚠️  LIVE MODE - Files will be permanently deleted\n'}`);
  }

  private async listAllFiles(): Promise<FileVersion[]> {
    console.log('📋 Scanning bucket for all files...');
    const allFiles: FileVersion[] = [];
    let startFileName: string | null = null;
    let pageCount = 0;

    while (true) {
      pageCount++;
      process.stdout.write(`\r   Scanning page ${pageCount}... (${allFiles.length} files found)`);

      const response = await this.b2.listFileNames({
        bucketId: this.bucketId,
        maxFileCount: 10000,
        startFileName: startFileName || undefined,
      } as any);

      const files = response.data.files;

      for (const file of files) {
        allFiles.push({
          fileId: file.fileId,
          fileName: file.fileName,
          uploadTimestamp: file.uploadTimestamp,
          size: file.contentLength || 0,
          action: file.action,
        });
      }

      if (files.length < 10000) {
        break;
      }

      startFileName = files[files.length - 1].fileName;
    }

    console.log(`\n✅ Found ${allFiles.length} total files\n`);
    return allFiles;
  }

  private groupDuplicates(files: FileVersion[]): Map<string, FileVersion[]> {
    console.log('🔍 Analyzing for duplicates...');
    const groups = new Map<string, FileVersion[]>();

    for (const file of files) {
      if (!groups.has(file.fileName)) {
        groups.set(file.fileName, []);
      }
      groups.get(file.fileName)!.push(file);
    }

    return groups;
  }

  private identifyDuplicates(groups: Map<string, FileVersion[]>): DuplicateGroup[] {
    const duplicates: DuplicateGroup[] = [];

    for (const [fileName, versions] of groups.entries()) {
      if (versions.length > 1) {
        // Sort by upload timestamp (newest first)
        versions.sort((a, b) => b.uploadTimestamp - a.uploadTimestamp);

        // Keep the latest (newest) version
        const toKeep = versions[0];
        const toDelete = versions.slice(1);

        duplicates.push({
          fileName,
          versions,
          toKeep,
          toDelete,
        });
      }
    }

    return duplicates;
  }

  private calculateStats(
    totalFiles: number,
    groups: Map<string, FileVersion[]>,
    duplicates: DuplicateGroup[],
  ): DeduplicationStats {
    const filesToDelete = duplicates.reduce(
      (sum, group) => sum + group.toDelete.length,
      0,
    );
    const storageToFree = duplicates.reduce(
      (sum, group) =>
        sum + group.toDelete.reduce((s, f) => s + f.size, 0),
      0,
    );

    return {
      totalFiles,
      uniqueFiles: groups.size,
      duplicateGroups: duplicates.length,
      filesToDelete,
      storageToFree,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  private formatDate(timestamp: number): string {
    return new Date(timestamp).toISOString();
  }

  private displayStats(stats: DeduplicationStats) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DEDUPLICATION ANALYSIS');
    console.log('='.repeat(60));
    console.log(`📁 Total files in bucket:     ${stats.totalFiles}`);
    console.log(`✨ Unique files:              ${stats.uniqueFiles}`);
    console.log(`🔄 Duplicate groups found:    ${stats.duplicateGroups}`);
    console.log(`🗑️  Files to delete:           ${stats.filesToDelete}`);
    console.log(`💾 Storage to free:           ${this.formatBytes(stats.storageToFree)}`);
    console.log('='.repeat(60) + '\n');
  }

  private displayDuplicateExamples(duplicates: DuplicateGroup[]) {
    console.log('📋 Sample duplicate groups (showing first 5):\n');

    const samplesToShow = Math.min(5, duplicates.length);
    for (let i = 0; i < samplesToShow; i++) {
      const group = duplicates[i];
      console.log(`\n${i + 1}. ${group.fileName}`);
      console.log(`   Versions: ${group.versions.length}`);
      console.log(`   ✅ KEEP:   ${this.formatDate(group.toKeep.uploadTimestamp)} - ${this.formatBytes(group.toKeep.size)}`);
      for (const file of group.toDelete) {
        console.log(`   ❌ DELETE: ${this.formatDate(file.uploadTimestamp)} - ${this.formatBytes(file.size)}`);
      }
    }

    if (duplicates.length > 5) {
      console.log(`\n   ... and ${duplicates.length - 5} more duplicate groups`);
    }
    console.log();
  }

  private async deleteFile(fileId: string, fileName: string): Promise<void> {
    await this.b2.deleteFileVersion({
      fileId,
      fileName,
    });
  }

  private async saveDeletedFilesLog(): Promise<void> {
    if (this.deletedFiles.length === 0) {
      return;
    }

    const logData = {
      deletedAt: new Date().toISOString(),
      bucketId: this.bucketId,
      bucketName: this.bucketName,
      totalDeleted: this.deletedFiles.length,
      totalStorageFreed: this.deletedFiles.reduce((sum, f) => sum + f.size, 0),
      files: this.deletedFiles,
    };

    await fs.writeFile(this.logFile, JSON.stringify(logData, null, 2));
    console.log(`\n📝 Deleted files log saved to: ${this.logFile}`);
  }

  private async performDeletion(duplicates: DuplicateGroup[]): Promise<void> {
    if (this.dryRun) {
      console.log('🔍 DRY RUN MODE - No files will be deleted');
      console.log('   Run with --execute flag to perform actual deletion\n');
      return;
    }

    console.log('⚠️  Starting deletion process...\n');

    let deleted = 0;
    let failed = 0;
    const totalToDelete = duplicates.reduce(
      (sum, group) => sum + group.toDelete.length,
      0,
    );

    for (const group of duplicates) {
      for (const file of group.toDelete) {
        try {
          await this.deleteFile(file.fileId, file.fileName);

          this.deletedFiles.push({
            fileId: file.fileId,
            fileName: file.fileName,
            size: file.size,
            uploadTimestamp: file.uploadTimestamp,
            deletedAt: new Date().toISOString(),
          });

          deleted++;
          process.stdout.write(
            `\r   Progress: ${deleted}/${totalToDelete} deleted, ${failed} failed`,
          );
        } catch (error: any) {
          failed++;
          console.error(
            `\n   ❌ Failed to delete ${file.fileName}: ${error.message}`,
          );
        }
      }
    }

    console.log('\n');
    await this.saveDeletedFilesLog();
  }

  async deduplicate(): Promise<void> {
    // Step 1: List all files
    const allFiles = await this.listAllFiles();

    // Step 2: Group by filename
    const groups = this.groupDuplicates(allFiles);

    // Step 3: Identify duplicates (keep latest)
    const duplicates = this.identifyDuplicates(groups);

    // Step 4: Calculate statistics
    const stats = this.calculateStats(allFiles.length, groups, duplicates);

    // Step 5: Display analysis
    this.displayStats(stats);

    if (duplicates.length === 0) {
      console.log('✅ No duplicates found! Bucket is clean.\n');
      return;
    }

    // Step 6: Show examples
    this.displayDuplicateExamples(duplicates);

    // Step 7: Perform deletion (or dry-run)
    await this.performDeletion(duplicates);

    // Step 8: Summary
    if (this.dryRun) {
      console.log('✅ Dry-run analysis complete!');
      console.log(`   ${stats.filesToDelete} files would be deleted`);
      console.log(`   ${this.formatBytes(stats.storageToFree)} would be freed\n`);
    } else {
      console.log('✅ Deduplication complete!');
      console.log(`   ${this.deletedFiles.length} files deleted`);
      console.log(
        `   ${this.formatBytes(this.deletedFiles.reduce((sum, f) => sum + f.size, 0))} freed\n`,
      );
    }
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const bucketId = args.find((arg) => arg.startsWith('--bucketId='))?.split('=')[1];
    const bucketName = args.find((arg) => arg.startsWith('--bucketName='))?.split('=')[1];
    const execute = args.includes('--execute');
    const logFile = args.find((arg) => arg.startsWith('--logFile='))?.split('=')[1];

    if (!bucketId || !bucketName) {
      console.error('❌ Missing required arguments\n');
      console.log('Usage:');
      console.log('  npm run deduplicate:b2 -- --bucketId=XXX --bucketName=YYY [--execute] [--logFile=path]\n');
      console.log('Options:');
      console.log('  --bucketId     B2 bucket ID (required)');
      console.log('  --bucketName   B2 bucket name (required)');
      console.log('  --execute      Actually delete files (default: dry-run)');
      console.log('  --logFile      Path to save deleted files log (default: .b2-deduplication-log.json)\n');
      console.log('Examples:');
      console.log('  # Dry-run (safe, no deletion)');
      console.log('  npm run deduplicate:b2 -- --bucketId=XXX --bucketName=YYY\n');
      console.log('  # Execute actual deletion');
      console.log('  npm run deduplicate:b2 -- --bucketId=XXX --bucketName=YYY --execute\n');
      process.exit(1);
    }

    const deduplicator = new B2Deduplicator(bucketId, bucketName, {
      dryRun: !execute,
      logFile,
    });

    await deduplicator.initialize();
    await deduplicator.deduplicate();

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Deduplication failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
