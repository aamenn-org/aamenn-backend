# API Reference

## Base URL

```
/api/v1
```

## Authentication

All endpoints (except `/health`) require a valid JWT Bearer token:

```
Authorization: Bearer <jwt_token>
```

---

## Health Check

### GET /health

Check if the API is running.

**Auth:** Public

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-01-02T12:00:00.000Z"
}
```

---

## User Management

### GET /users/me

Get current user's profile.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "hasSecuritySetup": true,
    "createdAt": "2026-01-02T12:00:00.000Z"
  }
}
```

### GET /users/security

Get user's encryption parameters (for client-side key derivation).

**Response:**

```json
{
  "success": true,
  "data": {
    "configured": true,
    "passwordSalt": "base64-encoded-salt",
    "kdfParams": {
      "algorithm": "argon2id",
      "memory": 65536,
      "iterations": 3,
      "parallelism": 4,
      "hashLength": 32
    }
  }
}
```

### POST /users/security

Set up user's encryption parameters (called once during vault setup).

**Request:**

```json
{
  "passwordSalt": "base64-encoded-salt",
  "kdfParams": {
    "algorithm": "argon2id",
    "memory": 65536,
    "iterations": 3,
    "parallelism": 4,
    "hashLength": 32
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Security parameters configured successfully"
  }
}
```

---

## Files

### POST /files/upload-init

Initialize a file upload and get signed B2 upload URL.

**Request:**

```json
{
  "fileNameEncrypted": "encrypted-filename-base64",
  "mimeType": "image/jpeg",
  "sizeBytes": 1234567,
  "cipherFileKey": "encrypted-file-key-base64"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "uploadUrl": "https://pod-xxx.backblaze.com/b2api/v1/b2_upload_file/...",
    "authorizationToken": "xxx",
    "b2FilePath": "users/uuid/2026/01/uuid.enc"
  }
}
```

**Client Upload:**
After receiving the response, upload the encrypted file directly to B2:

```
POST {uploadUrl}
Authorization: {authorizationToken}
Content-Type: application/octet-stream
X-Bz-File-Name: {b2FilePath}
X-Bz-Content-Sha1: {sha1-of-encrypted-content}

<encrypted-file-bytes>
```

### GET /files/:id

Get file metadata and signed download URL.

**Response:**

```json
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "cipherFileKey": "encrypted-file-key-base64",
    "fileNameEncrypted": "encrypted-filename-base64",
    "mimeType": "image/jpeg",
    "sizeBytes": 1234567,
    "downloadUrl": "https://f000.backblazeb2.com/file/bucket/path?Authorization=...",
    "createdAt": "2026-01-02T12:00:00.000Z",
    "updatedAt": "2026-01-02T12:00:00.000Z"
  }
}
```

### GET /files

List user's files.

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 100)

**Response:**

```json
{
  "success": true,
  "data": {
    "files": [
      {
        "fileId": "uuid",
        "fileNameEncrypted": "encrypted-filename-base64",
        "mimeType": "image/jpeg",
        "sizeBytes": 1234567,
        "createdAt": "2026-01-02T12:00:00.000Z",
        "updatedAt": "2026-01-02T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 100,
      "totalPages": 2
    }
  }
}
```

### DELETE /files/:id

Soft delete a file.

**Response:**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "File deleted"
  }
}
```

---

## Albums

### POST /albums

Create a new album.

**Request:**

```json
{
  "titleEncrypted": "encrypted-title-base64"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "albumId": "uuid",
    "titleEncrypted": "encrypted-title-base64",
    "createdAt": "2026-01-02T12:00:00.000Z"
  }
}
```

### GET /albums

List all albums.

**Response:**

```json
{
  "success": true,
  "data": {
    "albums": [
      {
        "albumId": "uuid",
        "titleEncrypted": "encrypted-title-base64",
        "fileCount": 10,
        "createdAt": "2026-01-02T12:00:00.000Z"
      }
    ]
  }
}
```

### GET /albums/:id

Get album details.

**Response:**

```json
{
  "success": true,
  "data": {
    "albumId": "uuid",
    "titleEncrypted": "encrypted-title-base64",
    "fileCount": 10,
    "createdAt": "2026-01-02T12:00:00.000Z"
  }
}
```

### POST /albums/:id/files

Add files to an album.

**Request:**

```json
{
  "fileIds": ["uuid1", "uuid2", "uuid3"]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "success": true,
    "addedCount": 3,
    "message": "Added 3 files to album"
  }
}
```

### GET /albums/:id/files

List files in an album.

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 100)

**Response:**

```json
{
  "success": true,
  "data": {
    "files": [
      {
        "fileId": "uuid",
        "fileNameEncrypted": "encrypted-filename-base64",
        "mimeType": "image/jpeg",
        "sizeBytes": 1234567,
        "orderIndex": 0,
        "createdAt": "2026-01-02T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 10,
      "totalPages": 1
    }
  }
}
```

### DELETE /albums/:id/files/:fileId

Remove a file from an album.

**Response:**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "File removed from album"
  }
}
```

### DELETE /albums/:id

Delete an album (files are not deleted).

**Response:**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Album deleted"
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "statusCode": 401,
  "timestamp": "2026-01-02T12:00:00.000Z",
  "path": "/api/v1/files",
  "message": "Authentication required"
}
```

Common status codes:

- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (access denied)
- `404` - Not Found
- `409` - Conflict (e.g., security already configured)
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error
