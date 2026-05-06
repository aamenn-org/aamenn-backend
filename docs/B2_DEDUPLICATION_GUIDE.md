# B2 Bucket Deduplication Guide

## Overview

This script removes duplicate files from your Backblaze B2 bucket. It identifies files with identical names but different upload timestamps and keeps only the **latest version**, deleting all older duplicates.

## Features

- ✅ **Dry-run mode by default** - Safe analysis without deletion
- ✅ **Keep latest strategy** - Preserves most recent uploads
- ✅ **Backup logging** - Records all deleted files for recovery
- ✅ **Progress tracking** - Real-time statistics and progress
- ✅ **Safe execution** - Requires explicit `--execute` flag for deletion

## Prerequisites

- Node.js and npm installed
- B2 credentials in `.env` file:
  ```env
  B2_APPLICATION_KEY_ID=your_key_id
  B2_APPLICATION_KEY=your_key
  ```
- Bucket ID and name

## Usage

### Step 1: Dry-Run Analysis (Recommended First)

```bash
npm run deduplicate:b2 -- \
  --bucketId=your_bucket_id \
  --bucketName=your_bucket_name
```

**This will:**
- Scan all files in the bucket
- Identify duplicate groups
- Show statistics and examples
- **NOT delete anything** (safe to run)

**Example output:**
```
============================================================
📊 DEDUPLICATION ANALYSIS
============================================================
📁 Total files in bucket:     1208
✨ Unique files:              1064
🔄 Duplicate groups found:    144
🗑️  Files to delete:           144
💾 Storage to free:           45.2 MB
============================================================

📋 Sample duplicate groups (showing first 5):

1. users/xxx/file.enc
   Versions: 2
   ✅ KEEP:   2026-02-17T16:35:00.000Z - 1.2 MB
   ❌ DELETE: 2026-02-17T16:30:00.000Z - 1.2 MB

...
```

### Step 2: Execute Deletion (After Review)

```bash
npm run deduplicate:b2 -- \
  --bucketId=your_bucket_id \
  --bucketName=your_bucket_name \
  --execute
```

**This will:**
- Delete all duplicate files (keeping latest)
- Save deletion log to `.b2-deduplication-log.json`
- Show progress and final statistics

## Command Options

| Option | Required | Description | Default |
|--------|----------|-------------|---------|
| `--bucketId` | ✅ Yes | B2 bucket ID | - |
| `--bucketName` | ✅ Yes | B2 bucket name | - |
| `--execute` | ❌ No | Actually delete files | `false` (dry-run) |
| `--logFile` | ❌ No | Path to save deletion log | `.b2-deduplication-log.json` |

## Deduplication Strategy

### How It Works

1. **Scan**: Lists all files in the bucket
2. **Group**: Groups files by identical filename
3. **Identify**: Finds groups with multiple versions
4. **Sort**: Orders versions by upload timestamp (newest first)
5. **Keep**: Preserves the **latest** (most recent) version
6. **Delete**: Removes all older versions

### Example

If you have:
```
file.enc uploaded at 16:30 (1.2 MB)
file.enc uploaded at 16:32 (1.2 MB)
file.enc uploaded at 16:35 (1.2 MB)
```

The script will:
- ✅ **Keep**: `file.enc` from 16:35 (latest)
- ❌ **Delete**: `file.enc` from 16:32
- ❌ **Delete**: `file.enc` from 16:30

## Deletion Log

After execution, a log file is created with all deleted files:

```json
{
  "deletedAt": "2026-02-17T16:40:00.000Z",
  "bucketId": "your_bucket_id",
  "bucketName": "your_bucket_name",
  "totalDeleted": 144,
  "totalStorageFreed": 47456789,
  "files": [
    {
      "fileId": "4_z...",
      "fileName": "users/xxx/file.enc",
      "size": 1234567,
      "uploadTimestamp": 1708185000000,
      "deletedAt": "2026-02-17T16:40:01.000Z"
    }
  ]
}
```

**Keep this log file** for recovery purposes.

## Safety Features

### 1. Dry-Run by Default
- Script runs in dry-run mode unless `--execute` is specified
- Safe to run multiple times for analysis

### 2. Deletion Log
- All deleted files are logged with metadata
- Includes file IDs, names, sizes, and timestamps
- Can be used for recovery or audit

### 3. Progress Tracking
- Real-time progress during deletion
- Shows success/failure counts
- Reports any errors without stopping

### 4. Error Handling
- Failed deletions are logged but don't stop the process
- Final summary shows success/failure counts

## Common Scenarios

### Scenario 1: Migration Created Duplicates

**Problem**: Ran migration script multiple times, created duplicates

**Solution**:
```bash
# 1. Analyze
npm run deduplicate:b2 -- --bucketId=XXX --bucketName=YYY

# 2. Review output, then execute
npm run deduplicate:b2 -- --bucketId=XXX --bucketName=YYY --execute
```

### Scenario 2: Check Specific Bucket

**Problem**: Want to check if a bucket has duplicates

**Solution**:
```bash
# Just run dry-run (no --execute flag)
npm run deduplicate:b2 -- --bucketId=XXX --bucketName=YYY
```

### Scenario 3: Custom Log Location

**Problem**: Want to save log to specific location

**Solution**:
```bash
npm run deduplicate:b2 -- \
  --bucketId=XXX \
  --bucketName=YYY \
  --execute \
  --logFile=/path/to/custom-log.json
```

## Troubleshooting

### Issue: "Missing required arguments"

**Cause**: Forgot to specify bucket ID or name

**Solution**: Provide both `--bucketId` and `--bucketName`

### Issue: "Authorization failed"

**Cause**: Invalid or missing B2 credentials

**Solution**: Check `.env` file has correct `B2_APPLICATION_KEY_ID` and `B2_APPLICATION_KEY`

### Issue: "Failed to delete" errors

**Cause**: Network issues or permission problems

**Solution**: 
- Check internet connection
- Verify B2 credentials have delete permissions
- Review error messages in output

### Issue: No duplicates found but I see them in B2 UI

**Cause**: B2 UI shows file versions, script only sees current files

**Solution**: This is normal - B2 versioning vs duplicate filenames are different

## Best Practices

1. **Always run dry-run first**
   ```bash
   npm run deduplicate:b2 -- --bucketId=XXX --bucketName=YYY
   ```

2. **Review the analysis output carefully**
   - Check sample duplicate groups
   - Verify storage to be freed makes sense
   - Ensure "keep latest" strategy is appropriate

3. **Keep the deletion log**
   - Don't delete `.b2-deduplication-log.json`
   - Back it up for recovery purposes

4. **Test with small bucket first**
   - If you have multiple buckets, test on smallest one
   - Verify behavior before running on production bucket

5. **Run during off-peak hours**
   - Large deletions can take time
   - Reduces impact on active users

## Recovery

If you need to recover deleted files:

1. **Check deletion log** (`.b2-deduplication-log.json`)
2. **File IDs are recorded** - contact B2 support if needed
3. **B2 versioning**: If enabled, files may be recoverable

**Note**: Once deleted, files cannot be automatically restored by this script.

## Performance

- **Scanning**: ~10,000 files per API call
- **Deletion**: ~5-10 files per second (depends on B2 API limits)
- **Large buckets**: May take several minutes

**Example timings**:
- 1,000 files: ~1-2 minutes
- 10,000 files: ~5-10 minutes
- 100,000 files: ~30-60 minutes

## Security Notes

- Script uses credentials from `.env` file
- Never commit `.env` or log files to version control
- Deletion log contains sensitive file paths
- Keep log files secure

## Support

If you encounter issues:

1. Check this guide's troubleshooting section
2. Review the deletion log for error details
3. Verify B2 credentials and permissions
4. Check B2 API status at status.backblaze.com

## Summary

This script safely removes duplicate files from B2 buckets by:
- ✅ Keeping the latest version of each file
- ✅ Deleting older duplicates
- ✅ Logging all deletions for recovery
- ✅ Running in safe dry-run mode by default

Always start with a dry-run to analyze before executing actual deletions.
