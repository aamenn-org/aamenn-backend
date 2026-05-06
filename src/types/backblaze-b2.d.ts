declare module 'backblaze-b2' {
  interface B2Options {
    applicationKeyId: string;
    applicationKey: string;
  }

  interface AuthorizeResponse {
    data: {
      absoluteMinimumPartSize: number;
      accountId: string;
      allowed: {
        bucketId: string;
        bucketName: string;
        capabilities: string[];
        namePrefix: string | null;
      };
      apiUrl: string;
      authorizationToken: string;
      downloadUrl: string;
      recommendedPartSize: number;
      s3ApiUrl: string;
    };
  }

  interface GetUploadUrlResponse {
    data: {
      bucketId: string;
      uploadUrl: string;
      authorizationToken: string;
    };
  }

  interface GetDownloadAuthorizationResponse {
    data: {
      bucketId: string;
      fileNamePrefix: string;
      authorizationToken: string;
    };
  }

  interface ListFileNamesResponse {
    data: {
      files: Array<{
        accountId: string;
        action: string;
        bucketId: string;
        contentLength: number;
        contentSha1: string;
        contentType: string;
        fileId: string;
        fileName: string;
        uploadTimestamp: number;
      }>;
      nextFileName: string | null;
    };
  }

  interface DeleteFileVersionResponse {
    data: {
      fileId: string;
      fileName: string;
    };
  }

  interface StartLargeFileResponse {
    data: {
      accountId: string;
      action: string;
      bucketId: string;
      contentType: string;
      fileId: string;
      fileName: string;
      uploadTimestamp: number;
    };
  }

  interface GetUploadPartUrlResponse {
    data: {
      fileId: string;
      uploadUrl: string;
      authorizationToken: string;
    };
  }

  interface FinishLargeFileResponse {
    data: {
      accountId: string;
      action: string;
      bucketId: string;
      contentLength: number;
      contentSha1: string;
      contentType: string;
      fileId: string;
      fileName: string;
      uploadTimestamp: number;
    };
  }

  interface CancelLargeFileResponse {
    data: {
      accountId: string;
      bucketId: string;
      fileId: string;
      fileName: string;
    };
  }

  interface ListPartsResponse {
    data: {
      parts: Array<{
        fileId: string;
        partNumber: number;
        contentLength: number;
        contentSha1: string;
        uploadTimestamp: number;
      }>;
      nextPartNumber: number | null;
    };
  }

  interface ListUnfinishedLargeFilesResponse {
    data: {
      files: Array<{
        accountId: string;
        action: string;
        bucketId: string;
        contentType: string;
        fileId: string;
        fileName: string;
        uploadTimestamp: number;
      }>;
      nextFileId: string | null;
    };
  }

  interface CorsRule {
    corsRuleName: string;
    allowedOrigins: string[];
    allowedHeaders: string[];
    allowedOperations: string[];
    exposeHeaders: string[];
    maxAgeSeconds: number;
  }

  interface ListBucketsResponse {
    data: {
      buckets: Array<{
        accountId: string;
        bucketId: string;
        bucketName: string;
        bucketType: string;
        corsRules: CorsRule[];
        lifecycleRules: unknown[];
        revision: number;
      }>;
    };
  }

  interface UpdateBucketResponse {
    data: {
      accountId: string;
      bucketId: string;
      bucketName: string;
      bucketType: string;
      corsRules: CorsRule[];
      revision: number;
    };
  }

  class B2 {
    constructor(options: B2Options);
    authorize(): Promise<AuthorizeResponse>;
    getUploadUrl(options: { bucketId: string }): Promise<GetUploadUrlResponse>;
    getDownloadAuthorization(options: {
      bucketId: string;
      fileNamePrefix: string;
      validDurationInSeconds: number;
    }): Promise<GetDownloadAuthorizationResponse>;
    listFileNames(options: {
      bucketId: string;
      prefix?: string;
      maxFileCount?: number;
    }): Promise<ListFileNamesResponse>;
    deleteFileVersion(options: {
      fileId: string;
      fileName: string;
    }): Promise<DeleteFileVersionResponse>;
    startLargeFile(options: {
      bucketId: string;
      fileName: string;
      contentType: string;
    }): Promise<StartLargeFileResponse>;
    getUploadPartUrl(options: {
      fileId: string;
    }): Promise<GetUploadPartUrlResponse>;
    finishLargeFile(options: {
      fileId: string;
      partSha1Array: string[];
    }): Promise<FinishLargeFileResponse>;
    cancelLargeFile(options: {
      fileId: string;
    }): Promise<CancelLargeFileResponse>;
    listParts(options: {
      fileId: string;
      startPartNumber?: number;
      maxPartCount?: number;
    }): Promise<ListPartsResponse>;
    listUnfinishedLargeFiles(options: {
      bucketId: string;
      startFileId?: string;
      maxFileCount?: number;
    }): Promise<ListUnfinishedLargeFilesResponse>;
    listBuckets(options?: {
      bucketId?: string;
      bucketName?: string;
    }): Promise<ListBucketsResponse>;
    updateBucket(options: {
      bucketId: string;
      bucketType: string;
      corsRules?: CorsRule[];
      lifecycleRules?: unknown[];
    }): Promise<UpdateBucketResponse>;
  }

  export = B2;
}
