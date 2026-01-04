/**
 * Interface for cloud storage services
 * Allows swapping B2 for other providers (S3, GCS, etc.)
 */
export interface IStorageService {
  /**
   * Get a signed URL for uploading a file
   */
  getSignedUploadUrl(userId: string): Promise<SignedUploadUrl>;

  /**
   * Get a signed URL for downloading a file
   */
  getSignedDownloadUrl(filePath: string): Promise<SignedDownloadUrl>;

  /**
   * Generate a unique file path for storage
   */
  generateFilePath(userId: string, suffix?: string): string;

  /**
   * Upload file directly to storage (proxy upload)
   */
  uploadFile(
    filePath: string,
    fileBuffer: Buffer,
    sha1Hash: string,
  ): Promise<void>;

  /**
   * Delete files from storage
   * Accepts single path or array of paths. Filters out null/undefined automatically.
   */
  deleteFiles(filePaths: string | (string | null | undefined)[]): Promise<void>;
}

export interface SignedUploadUrl {
  uploadUrl: string;
  authorizationToken: string;
  b2FilePath: string;
}

export interface SignedDownloadUrl {
  downloadUrl: string;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';
