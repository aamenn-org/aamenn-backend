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
  private signedUrlExpiration: number;

  constructor(private configService: ConfigService) {
    this.bucketId = this.configService.getOrThrow<string>('B2_BUCKET_ID');
    this.bucketName = this.configService.getOrThrow<string>('B2_BUCKET_NAME');
    this.signedUrlExpiration = this.configService.get<number>(
      'B2_SIGNED_URL_EXPIRATION',
      300,
    );
  }

  async onModuleInit() {
    await this.authorize();
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

      this.logger.log('B2 authorization successful');
    } catch (error) {
      this.logger.error('Failed to authorize with B2');
      throw new InternalServerErrorException('Storage service unavailable');
    }
  }

  /**
   * Generate a unique file path for B2 storage.
   * Format: users/{userId}/{year}/{month}/{uuid}[-suffix].enc
   * @param userId - The user's ID
   * @param suffix - Optional suffix for thumbnails (e.g., 'thumb-small', 'thumb-medium')
   */
  generateFilePath(userId: string, suffix?: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const fileId = uuidv4();
    const fileName = suffix ? `${fileId}-${suffix}` : fileId;

    return `users/${userId}/${year}/${month}/${fileName}.enc`;
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
      // Use account auth token directly - this works for private buckets
      // when the app key has read access. getDownloadAuthorization requires
      // the 'shareFiles' capability which may not always be available.
      const downloadUrl = `${this.downloadUrl}/file/${this.bucketName}/${b2FilePath}?Authorization=${this.authToken}`;
      return { downloadUrl };
    } catch (error: any) {
      this.logger.error('Failed to get download URL from B2', error?.message);

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

      // Upload file to B2 using fetch since B2 SDK uploadFile has issues
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
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`B2 upload failed: ${errorText}`);
      }

      this.logger.log(`File uploaded successfully: ${b2FilePath}`);
    } catch (error: any) {
      this.logger.error('Failedd to upload file to B2');
      this.logger.error(error.message || error);

      // Try re-authorizing if token expired
      if (error.response?.status === 401 || error.message?.includes('401')) {
        await this.authorize();
        return this.uploadFile(b2FilePath, fileBuffer, sha1Hash, retryCount);
      }

      // Retry on network errors (fetch failed)
      if (
        retryCount < MAX_RETRIES &&
        (error.message?.includes('fetch failed') ||
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
