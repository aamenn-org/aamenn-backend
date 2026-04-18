import {
  Injectable,
  OnModuleInit,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import B2 = require('backblaze-b2');
import { v4 as uuidv4 } from 'uuid';
import {
  IStorageService,
  SignedUploadUrl,
  SignedDownloadUrl,
} from './storage.interface';

@Injectable()
export class B2StorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(B2StorageService.name);
  private b2: InstanceType<typeof B2>;
  private bucketId: string;
  private bucketName: string;
  private downloadUrl: string;
  private authToken: string;
  private apiUrl: string;
  private accountId: string;
  private signedUrlExpiration: number;
  private corsConfigured = false;

  constructor(private configService: ConfigService) {
    this.bucketId = this.configService.getOrThrow<string>('B2_BUCKET_ID');
    this.bucketName = this.configService.getOrThrow<string>('B2_BUCKET_NAME');
    this.signedUrlExpiration = this.configService.get<number>(
      'B2_SIGNED_URL_EXPIRATION',
      300,
    );
  }

  async onModuleInit() {
    try {
      await this.authorize();
      // Configure CORS on bucket so browsers can upload chunks directly to B2
      await this.ensureBucketCors();
    } catch (error) {
      console.log('⚠️ B2 storage unavailable - daily limit reached or credentials issue');
      console.log('📁 File upload features will be disabled until B2 is available');
      // Don't throw error - let server continue without B2
    }
  }

  /**
   * Authorize with B2 API.
   * Should be called on startup and when authorization expires.
   */
  private async authorize(): Promise<void> {
    try {
      this.b2 = new B2({
        applicationKeyId: this.configService.getOrThrow<string>(
          'B2_APPLICATION_KEY_ID',
        ),
        applicationKey:
          this.configService.getOrThrow<string>('B2_APPLICATION_KEY'),
      });

      const authResponse = await this.b2.authorize();
      this.downloadUrl = authResponse.data.downloadUrl;
      this.authToken = authResponse.data.authorizationToken;
      this.apiUrl = authResponse.data.apiUrl;
      this.accountId = authResponse.data.accountId;

      this.logger.log('B2 authorization successful');
    } catch (error) {
      this.logger.error('Failed to authorize with B2');
      throw new InternalServerErrorException('Storage service unavailable');
    }
  }

  /**
   * Generate a unique file path for B2 storage.
   * Format: users/{userId}/{timestamp}-{randomId}
   * @param userId - The user's ID
   * @param prefix - Optional prefix for file path
   */
  generateFilePath(userId: string, prefix?: string): string {
    const timestamp = Date.now();
    const randomId = uuidv4();
    const filePrefix = prefix ? `${prefix}-` : '';
    return `users/${userId}/${filePrefix}${timestamp}-${randomId}`;
  }

  /**
   * Health check for B2 connectivity
   * Tests if we can successfully communicate with B2 API
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'error'; message: string }> {
    try {
      // Simple health check: verify we have valid auth token and bucket info
      if (!this.authToken || !this.bucketId || !this.downloadUrl) {
        return {
          status: 'error',
          message: 'B2 not initialized - missing credentials',
        };
      }

      // Test connectivity by getting upload URL (lightweight operation)
      const response = await this.b2.getUploadUrl({
        bucketId: this.bucketId,
      });

      if (response.data && response.data.uploadUrl) {
        return {
          status: 'healthy',
          message: 'B2 storage is operational',
        };
      }

      return {
        status: 'degraded',
        message: 'B2 responded but with unexpected data',
      };
    } catch (error: any) {
      this.logger.error('B2 health check failed', error?.message);

      // Try to re-authorize if token expired
      if (error.response?.status === 401) {
        try {
          await this.authorize();
          return {
            status: 'degraded',
            message: 'B2 token expired but re-authorization successful',
          };
        } catch (reAuthError) {
          return {
            status: 'error',
            message: 'B2 authorization failed',
          };
        }
      }

      return {
        status: 'error',
        message: `B2 storage error: ${error?.message || 'Unknown error'}`,
      };
    }
  }

  /**
   * Get a signed URL for uploading a file to B2.
   * The URL is valid for the duration specified in config (default 5 minutes).
   */
  async getSignedUploadUrl(userId: string): Promise<SignedUploadUrl> {
    try {
      // Get upload URL from B2
      const response = await this.b2.getUploadUrl({
        bucketId: this.bucketId,
      });

      const b2FilePath = this.generateFilePath(userId);

      return {
        uploadUrl: response.data.uploadUrl,
        authorizationToken: response.data.authorizationToken,
        b2FilePath,
      };
    } catch (error: any) {
      this.logger.error('Failed to get upload URL from B2');

      // Try re-authorizing if token expired
      if (error.response?.status === 401) {
        await this.authorize();
        return this.getSignedUploadUrl(userId);
      }

      throw new InternalServerErrorException('Failed to generate upload URL');
    }
  }

  /**
   * Get a signed URL for downloading a file from B2.
   * Uses the account authorization token directly (works for private buckets).
   * Note: getDownloadAuthorization requires 'shareFiles' capability on the app key.
   */
  async getSignedDownloadUrl(b2FilePath: string): Promise<SignedDownloadUrl> {
    try {
      // Use account authorization token directly (works for private buckets with read access)
      // This is secure and reliable - tokens expire after configured duration
      const downloadUrl = `${this.downloadUrl}/file/${this.bucketName}/${b2FilePath}?Authorization=${this.authToken}`;
      return { downloadUrl };
    } catch (error: any) {
      this.logger.error('Failed to generate download URL from B2', error?.message);

      // Try re-authorizing if token expired
      if (error.response?.status === 401) {
        this.logger.log('Re-authorizing with B2...');
        await this.authorize();
        return this.getSignedDownloadUrl(b2FilePath);
      }

      throw new InternalServerErrorException('Failed to generate download URL');
    }
  }

  /**
   * Download raw bytes from B2 to the backend (proxy download).
   *
   * Why this exists: mobile clients on restricted networks (emulators,
   * corporate VPN, captive portals) often cannot reach B2 directly even
   * though they can reach the API backend. Streaming encrypted bytes
   * through the backend also removes the B2 `Authorization` token from
   * the URL visible to the client, which is a strict security win.
   *
   * Performs a single GET against the pre-authed signed download URL and
   * returns the full response body as a Buffer. A 60-second hard timeout
   * prevents the backend request from hanging on B2 stalls.
   */
  async downloadBytes(b2FilePath: string): Promise<Buffer> {
    try {
      const signedUrl = `${this.downloadUrl}/file/${this.bucketName}/${b2FilePath}?Authorization=${this.authToken}`;
      const response = await fetch(signedUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        if (response.status === 401) {
          // Re-auth and retry once on expired token.
          await this.authorize();
          return this.downloadBytes(b2FilePath);
        }
        throw new Error(`B2 download failed: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      this.logger.error(
        `Failed to download bytes from B2 (${b2FilePath}): ${error?.message ?? error}`,
      );
      throw new InternalServerErrorException('Failed to download file');
    }
  }

  /**
   * Upload file directly to B2 (proxy upload through backend).
   * This avoids CORS issues by uploading through the backend.
   * Note: Each upload needs a fresh upload URL - B2 doesn't allow concurrent uploads with same token.
   */
  async uploadFile(
    b2FilePath: string,
    fileBuffer: Buffer,
    sha1Hash: string,
    retryCount = 0,
  ): Promise<void> {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

    try {
      // Get a fresh upload URL for each upload (B2 requires unique token per concurrent upload)
      const response = await this.b2.getUploadUrl({
        bucketId: this.bucketId,
      });

      // Upload file to B2 using fetch since B2 SDK uploadFile has issues.
      // 4-minute hard timeout: if B2 stalls (not just slow) this unblocks the
      // backend instead of hanging the request until nginx kills it at 300s.
      const uploadAbort = AbortSignal.timeout(240_000);
      const uploadResponse = await fetch(response.data.uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: response.data.authorizationToken,
          'Content-Type': 'application/octet-stream',
          'X-Bz-File-Name': encodeURIComponent(b2FilePath),
          'X-Bz-Content-Sha1': sha1Hash,
          'Content-Length': fileBuffer.length.toString(),
        },
        body: new Uint8Array(fileBuffer),
        signal: uploadAbort,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`B2 upload failed: ${errorText}`);
      }

      this.logger.log(`File uploaded successfully: ${b2FilePath}`);
    } catch (error: any) {
      this.logger.error('Failed to upload file to B2');
      this.logger.error(error.message || error);

      // Try re-authorizing if token expired
      if (error.response?.status === 401 || error.message?.includes('401')) {
        await this.authorize();
        return this.uploadFile(b2FilePath, fileBuffer, sha1Hash, retryCount);
      }

      // Retry on network errors and B2 fetch timeouts
      if (
        retryCount < MAX_RETRIES &&
        (error.name === 'TimeoutError' ||
          error.message?.includes('fetch failed') ||
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT')
      ) {
        const delay = RETRY_DELAYS[retryCount];
        this.logger.warn(
          `Network error, retrying upload in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.uploadFile(
          b2FilePath,
          fileBuffer,
          sha1Hash,
          retryCount + 1,
        );
      }

      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  // ==================== Bucket CORS Configuration ====================

  /**
   * Ensure the B2 bucket has CORS rules that allow browsers to call
   * b2_upload_part directly (the actual chunk PUT — not the session
   * management calls, which stay server-side as per B2 docs).
   *
   * WHY direct fetch instead of the SDK:
   * The backblaze-b2 npm package v1.x silently drops the `corsRules`
   * field when calling b2_update_bucket, so the SDK call returns 200
   * but never actually applies the rules. We bypass it entirely and
   * POST the exact JSON payload B2 expects, matching the format used
   * in the official b2-browser-upload sample.
   *
   * Rule format reference:
   * https://github.com/backblaze-b2-samples/b2-browser-upload
   * https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules
   */
  private async ensureBucketCors(): Promise<void> {
    if (this.corsConfigured) return;

    const RULE_NAME = 'aamennDirectUpload';

    try {
      // ── Step 1: read current bucket CORS rules via direct REST call ──
      // (SDK listBuckets may also not return corsRules reliably)
      const listResp = await fetch(
        `${this.apiUrl}/b2api/v2/b2_list_buckets`,
        {
          method: 'POST',
          headers: {
            Authorization: this.authToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            accountId: this.accountId,
            bucketId: this.bucketId,
          }),
        },
      );

      if (!listResp.ok) {
        this.logger.error(
          `b2_list_buckets failed: ${listResp.status} ${await listResp.text()}`,
        );
        return;
      }

      const listData = await listResp.json();
      const bucket = (listData.buckets ?? []).find(
        (b: { bucketId: string }) => b.bucketId === this.bucketId,
      );

      if (!bucket) {
        this.logger.warn('Bucket not found — cannot configure CORS');
        return;
      }

      // ── Step 2: skip if our rule already exists ──
      const existingRules: unknown[] = bucket.corsRules ?? [];
      if (
        existingRules.some(
          (r: any) => r.corsRuleName === RULE_NAME,
        )
      ) {
        this.logger.log('B2 bucket CORS already configured for direct uploads');
        this.corsConfigured = true;
        return;
      }

      // ── Step 3: build and apply the rule ──
      // allowedOrigins: ["*"] is what the official B2 browser-upload
      // sample uses. The upload tokens are already scoped + temporary
      // so wildcard origin is safe here.
      //
      // allowedHeaders must be an EXPLICIT list (not "*") for b2_upload_part
      // preflight to pass — B2 docs list exactly these three as required.
      const ourRule = {
        corsRuleName: RULE_NAME,
        allowedOrigins: ['*'],
        allowedOperations: [
          'b2_upload_file',
          'b2_upload_part',
          'b2_download_file_by_name',
          'b2_download_file_by_id',
        ],
        allowedHeaders: [
          'authorization',
          'content-type',
          'x-bz-content-sha1',
          'x-bz-part-number',
          'x-bz-file-name',
        ],
        exposeHeaders: ['x-bz-content-sha1'],
        maxAgeSeconds: 3600,
      };

      const updateResp = await fetch(
        `${this.apiUrl}/b2api/v2/b2_update_bucket`,
        {
          method: 'POST',
          headers: {
            Authorization: this.authToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            accountId: this.accountId,
            bucketId: this.bucketId,
            // Preserve any existing rules + append ours
            corsRules: [...existingRules, ourRule],
          }),
        },
      );

      if (!updateResp.ok) {
        const errBody = await updateResp.text();
        this.logger.error(
          `b2_update_bucket failed: ${updateResp.status} ${errBody}`,
        );
        return;
      }

      const updateData = await updateResp.json();
      const appliedCount = (updateData.corsRules ?? []).length;
      this.corsConfigured = true;
      this.logger.log(
        `B2 bucket CORS configured for direct browser uploads ` +
          `(${appliedCount} rule(s) active, allowedOrigins: *)`,
      );
    } catch (error: any) {
      this.logger.error(
        'Failed to configure B2 bucket CORS — direct browser uploads may fail',
        error?.message,
      );
    }
  }

  // ==================== Large File API ====================

  /**
   * Start a B2 large file upload session.
   * Returns the B2 fileId needed for subsequent part uploads.
   */
  async startLargeFile(b2FilePath: string): Promise<{ fileId: string }> {
    try {
      const response = await this.b2.startLargeFile({
        bucketId: this.bucketId,
        fileName: b2FilePath,
        contentType: 'application/octet-stream',
      });
      this.logger.log(`Started large file: ${b2FilePath} → ${response.data.fileId}`);
      return { fileId: response.data.fileId };
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.authorize();
        return this.startLargeFile(b2FilePath);
      }
      this.logger.error('Failed to start large file', error?.message);
      throw new InternalServerErrorException('Failed to start large file upload');
    }
  }

  /**
   * Get a signed URL for uploading a single part of a large file.
   */
  async getUploadPartUrl(
    fileId: string,
  ): Promise<{ uploadUrl: string; authorizationToken: string }> {
    try {
      const response = await this.b2.getUploadPartUrl({ fileId });
      return {
        uploadUrl: response.data.uploadUrl,
        authorizationToken: response.data.authorizationToken,
      };
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.authorize();
        return this.getUploadPartUrl(fileId);
      }
      this.logger.error('Failed to get upload part URL', error?.message);
      throw new InternalServerErrorException('Failed to get upload part URL');
    }
  }

  /**
   * Batch-fetch multiple upload part URLs in parallel.
   * Each URL is independent and can be used for one part upload.
   */
  async getUploadPartUrls(
    fileId: string,
    count: number,
  ): Promise<Array<{ uploadUrl: string; authorizationToken: string }>> {
    const results = await Promise.all(
      Array.from({ length: count }, () => this.getUploadPartUrl(fileId)),
    );
    return results;
  }

  /**
   * Finish a large file upload by providing the ordered SHA-1 hashes of all parts.
   */
  async finishLargeFile(fileId: string, partSha1Array: string[]): Promise<void> {
    try {
      await this.b2.finishLargeFile({
        fileId,
        partSha1Array,
      });
      this.logger.log(`Finished large file: ${fileId}`);
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.authorize();
        return this.finishLargeFile(fileId, partSha1Array);
      }
      this.logger.error('Failed to finish large file', error?.message);
      throw new InternalServerErrorException('Failed to finish large file upload');
    }
  }

  /**
   * Cancel an in-progress large file upload. Frees B2 storage used by uploaded parts.
   */
  async cancelLargeFile(fileId: string): Promise<void> {
    try {
      await this.b2.cancelLargeFile({ fileId });
      this.logger.log(`Cancelled large file: ${fileId}`);
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.authorize();
        return this.cancelLargeFile(fileId);
      }
      // 404 means already cancelled/finished — not an error
      if (error.response?.status === 404 || error.response?.status === 400) {
        this.logger.warn(`Large file already gone: ${fileId}`);
        return;
      }
      this.logger.error('Failed to cancel large file', error?.message);
      throw new InternalServerErrorException('Failed to cancel large file');
    }
  }

  /**
   * List parts that have been uploaded for a large file.
   * Used for resume reconciliation.
   */
  async listParts(
    fileId: string,
  ): Promise<{ parts: Array<{ partNumber: number; contentSha1: string; contentLength: number }> }> {
    try {
      const allParts: Array<{ partNumber: number; contentSha1: string; contentLength: number }> = [];
      let startPartNumber = 0;

      // Paginate through all parts
      while (true) {
        const response = await this.b2.listParts({
          fileId,
          startPartNumber,
          maxPartCount: 1000,
        });

        const parts = response.data.parts || [];
        for (const p of parts) {
          allParts.push({
            partNumber: p.partNumber,
            contentSha1: p.contentSha1,
            contentLength: p.contentLength,
          });
        }

        if (response.data.nextPartNumber === null || response.data.nextPartNumber === undefined) {
          break;
        }
        startPartNumber = response.data.nextPartNumber;
      }

      return { parts: allParts };
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.authorize();
        return this.listParts(fileId);
      }
      this.logger.error('Failed to list parts', error?.message);
      throw new InternalServerErrorException('Failed to list file parts');
    }
  }

  /**
   * List unfinished large file uploads in the bucket.
   * Used by cleanup cron to find orphaned uploads.
   */
  async listUnfinishedLargeFiles(): Promise<
    Array<{ fileId: string; fileName: string; uploadTimestamp: number }>
  > {
    try {
      const allFiles: Array<{ fileId: string; fileName: string; uploadTimestamp: number }> = [];
      let startFileId: string | undefined;

      while (true) {
        const response = await this.b2.listUnfinishedLargeFiles({
          bucketId: this.bucketId,
          maxFileCount: 100,
          ...(startFileId ? { startFileId } : {}),
        });
        const files = response.data.files || [];

        for (const f of files) {
          allFiles.push({
            fileId: f.fileId,
            fileName: f.fileName,
            uploadTimestamp: f.uploadTimestamp,
          });
        }

        if (!response.data.nextFileId) {
          break;
        }
        startFileId = response.data.nextFileId;
      }

      return allFiles;
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.authorize();
        return this.listUnfinishedLargeFiles();
      }
      this.logger.error('Failed to list unfinished large files', error?.message);
      return [];
    }
  }

  // ==================== File Operations ====================

  /**
   * Delete files from B2 storage in parallel.
   * Accepts single path or array of paths. Filters out null/undefined automatically.
   */
  async deleteFiles(
    b2FilePaths: string | (string | null | undefined)[],
  ): Promise<void> {
    const paths = Array.isArray(b2FilePaths) ? b2FilePaths : [b2FilePaths];
    const validPaths = paths.filter((p): p is string => !!p);

    await Promise.all(
      validPaths.map(async (b2FilePath) => {
        try {
          const listResponse = await this.b2.listFileNames({
            bucketId: this.bucketId,
            prefix: b2FilePath,
            maxFileCount: 1,
          });

          if (listResponse.data.files.length === 0) {
            this.logger.warn(`File not found in B2: ${b2FilePath}`);
            return;
          }

          const { fileId, fileName } = listResponse.data.files[0];
          await this.b2.deleteFileVersion({ fileId, fileName });
          this.logger.log(`Deleted file from B2: ${b2FilePath}`);
        } catch {
          this.logger.error(`Failed to delete file from B2: ${b2FilePath}`);
          // Don't throw - continue deleting other files
        }
      }),
    );
  }
}
