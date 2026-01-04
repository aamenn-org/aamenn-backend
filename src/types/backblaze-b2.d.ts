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
  }

  export = B2;
}
