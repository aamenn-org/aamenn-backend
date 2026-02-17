# B2 Bucket Migration Guide

This guide explains how to migrate all encrypted files and thumbnails from one Backblaze B2 bucket to another using the migration script.

## Overview

The migration script:
- ✅ Copies all objects using B2 server-side copy (fast, no egress costs)
- ✅ Keeps the same object paths (no database changes needed)
- ✅ Shows detailed progress with speed and ETA
- ✅ Supports resume if interrupted
- ✅ Handles errors gracefully
- ✅ Supports dry-run mode for testing
- ✅ Includes verification mode

## Prerequisites

- Source B2 bucket credentials (current `.env`)
- Destination B2 bucket credentials (new account)
- Database access
- Node.js and npm installed

## Step 1: Prepare Destination Bucket Credentials

### Option A: Using a Config File (Recommended - Most Secure)

Create a secure config file:

```bash
# Create config file
sudo nano /root/new-b2-config.json
```

Add this content:
```json
{
  "newApplicationKeyId": "your-new-key-id",
  "newApplicationKey": "your-new-key"
}
```

Secure the file:
```bash
sudo chmod 600 /root/new-b2-config.json
```

### Option B: Using Environment Variables

```bash
export B2_NEW_APPLICATION_KEY_ID="your-new-key-id"
export B2_NEW_APPLICATION_KEY="your-new-key"
```

## Step 2: Run Migration (Copy Mode)

### Using Config File

```bash
cd /var/www/aamenn-backend

npm run migrate:b2:bucket -- \
  --newBucketId=your-new-bucket-id \
  --newBucketName=your-new-bucket-name \
  --configFile=/root/new-b2-config.json \
  --concurrency=5 \
  --batchSize=200
```

### Using Environment Variables

```bash
cd /var/www/aamenn-backend

export B2_NEW_APPLICATION_KEY_ID="your-new-key-id"
export B2_NEW_APPLICATION_KEY="your-new-key"

npm run migrate:b2:bucket -- \
  --newBucketId=your-new-bucket-id \
  --newBucketName=your-new-bucket-name \
  --concurrency=5
```

## Step 3: Monitor Progress

The script shows real-time progress:

```
============================================================
Progress: 1250/5000 (25.00%)
✅ Copied: 1248
❌ Failed: 2
⏱️  Speed: 12.50 objects/sec
⏳ ETA: 5m 0s
📄 Current: users/abc-123/1739798400-xyz789.jpg...
============================================================
```

## Step 4: Resume if Interrupted

If the script stops, just re-run the same command. It will automatically resume from where it left off using the state file (`.b2-migration-state.json`).

## Step 5: Verify Migration

After copy completes, run verification:

```bash
npm run migrate:b2:bucket -- \
  --newBucketId=your-new-bucket-id \
  --newBucketName=your-new-bucket-name \
  --configFile=/root/new-b2-config.json \
  --mode=verify
```

This checks that all objects exist in the destination bucket.

## Step 6: Update Application Configuration

Once migration and verification are complete:

1. **Backup current `.env`:**
   ```bash
   cp .env .env.backup
   ```

2. **Update `.env` file:**
   ```bash
   nano .env
   ```

   Change these lines:
   ```bash
   B2_APPLICATION_KEY_ID=your-new-key-id
   B2_APPLICATION_KEY=your-new-key
   B2_BUCKET_ID=your-new-bucket-id
   B2_BUCKET_NAME=your-new-bucket-name
   ```

3. **Restart application:**
   ```bash
   docker compose down
   docker compose up -d
   ```

4. **Verify application works:**
   ```bash
   docker logs --tail=50 aamenn-backend-api-1
   ```

## Step 7: Test User Access

- Log in as a test user
- View photos/files
- Download a file
- Upload a new file

All should work normally since object paths remain the same.

## Advanced Options

### Dry Run (Test Without Copying)

```bash
npm run migrate:b2:bucket -- \
  --newBucketId=your-new-bucket-id \
  --newBucketName=your-new-bucket-name \
  --configFile=/root/new-b2-config.json \
  --dryRun
```

### Custom Concurrency and Batch Size

```bash
npm run migrate:b2:bucket -- \
  --newBucketId=your-new-bucket-id \
  --newBucketName=your-new-bucket-name \
  --configFile=/root/new-b2-config.json \
  --concurrency=10 \
  --batchSize=500
```

### Custom State File Location

```bash
npm run migrate:b2:bucket -- \
  --newBucketId=your-new-bucket-id \
  --newBucketName=your-new-bucket-name \
  --configFile=/root/new-b2-config.json \
  --stateFile=/var/backups/migration-state.json
```

### Stop After Max Errors

```bash
npm run migrate:b2:bucket -- \
  --newBucketId=your-new-bucket-id \
  --newBucketName=your-new-bucket-name \
  --configFile=/root/new-b2-config.json \
  --maxErrors=50
```

## Troubleshooting

### Error: "Object not found in source bucket"

Some files in the database may have been deleted from B2. The script will log these and continue.

### Error: "Max errors reached"

Check the state file (`.b2-migration-state.json`) for detailed error messages. Common causes:
- Network issues
- B2 API rate limits
- Invalid credentials

### Migration is Slow

Increase concurrency:
```bash
--concurrency=10
```

But be careful not to hit B2 rate limits.

### Need to Rollback

If something goes wrong after cutover:

1. **Restore old `.env`:**
   ```bash
   cp .env.backup .env
   ```

2. **Restart:**
   ```bash
   docker compose up -d --force-recreate
   ```

## Security Notes

- ✅ Never pass credentials as command-line arguments
- ✅ Use config file with `chmod 600` or environment variables
- ✅ Delete config file after migration: `rm /root/new-b2-config.json`
- ✅ Keep old bucket for 30 days as backup before deleting

## Performance Tips

- Run migration during low-traffic hours
- Use higher concurrency for faster migration (but watch B2 rate limits)
- Monitor B2 API usage in B2 dashboard
- Expect ~10-50 objects/sec depending on network and B2 performance

## Post-Migration Cleanup

After confirming everything works (wait 30 days):

1. **Delete old bucket** (via B2 console)
2. **Remove backup `.env`:** `rm .env.backup`
3. **Remove state file:** `rm .b2-migration-state.json`
4. **Remove config file:** `rm /root/new-b2-config.json`

## Support

If you encounter issues:
1. Check the state file for detailed errors
2. Review B2 API logs in B2 console
3. Verify credentials are correct
4. Ensure both buckets are accessible
