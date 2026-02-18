# 📚 Complete Postman API Guide

A comprehensive guide for testing the Aamenn Encrypted Photo Vault API using Postman.

## 🔗 Base URL

```
http://localhost:3000
```

**Swagger Documentation:** http://localhost:3000/docs

---

## 🚀 Postman Setup

### Step 1: Create New Collection

1. Open Postman
2. Click **New Collection**
3. Name it: **"Aamenn Vault API"**

### Step 2: Create Environment

Create environment **"Aamenn Local"** with these variables:

| Variable        | Initial Value           | Description                      |
| --------------- | ----------------------- | -------------------------------- |
| `base_url`      | `http://localhost:3000` | API base URL                     |
| `access_token`  |                         | JWT access token (auto-filled)   |
| `refresh_token` |                         | Refresh token (auto-filled)      |
| `user_id`       |                         | Current user ID (auto-filled)    |
| `file_id`       |                         | Last created file (auto-filled)  |
| `album_id`      |                         | Last created album (auto-filled) |

### Step 3: Configure Collection Authorization

1. In Collection settings, go to **Authorization** tab
2. **Type**: Bearer Token
3. **Token**: `{{access_token}}`

---

## 📍 API Endpoints

---

## 🔐 Authentication

### 1. Register User

**Purpose:** Create a new user account with email and password

```http
POST {{base_url}}/auth/register
Content-Type: application/json
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Success Response (201 Created):**

```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

**Error Response (409 Conflict):**

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "User with this email already exists"
}
```

**Postman Tests (Auto-save tokens):**

```javascript
if (pm.response.code === 201) {
  const response = pm.response.json();
  pm.environment.set('access_token', response.accessToken);
  pm.environment.set('refresh_token', response.refreshToken);
  pm.environment.set('user_id', response.userId);
}
```

---

### 2. Login

**Purpose:** Authenticate with email and password

```http
POST {{base_url}}/auth/login
Content-Type: application/json
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Success Response (200 OK):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

**Error Response (401 Unauthorized):**

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid credentials"
}
```

**Postman Tests:**

```javascript
if (pm.response.code === 200) {
  const response = pm.response.json();
  pm.environment.set('access_token', response.accessToken);
  pm.environment.set('refresh_token', response.refreshToken);
}
```

---

### 3. Google OAuth Login

**Purpose:** Authenticate with Google ID token

```http
POST {{base_url}}/auth/google
Content-Type: application/json
```

**Request Body:**

```json
{
  "idToken": "google-oauth-id-token-from-client"
}
```

**Success Response (200 OK):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

**Error Response (401 Unauthorized):**

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid Google token"
}
```

---

### 4. Refresh Token

**Purpose:** Get new access token using refresh token

```http
POST {{base_url}}/auth/refresh
Content-Type: application/json
```

**Request Body:**

```json
{
  "refreshToken": "{{refresh_token}}"
}
```

**Success Response (200 OK):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

**Error Response (401 Unauthorized):**

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid or expired refresh token"
}
```

**Postman Tests:**

```javascript
if (pm.response.code === 200) {
  const response = pm.response.json();
  pm.environment.set('access_token', response.accessToken);
  pm.environment.set('refresh_token', response.refreshToken);
}
```

---

## 👤 Users

### 5. Get Current User

**Purpose:** Get authenticated user's profile

```http
GET {{base_url}}/users/me
Authorization: Bearer {{access_token}}
```

**Success Response (200 OK):**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "hasSecuritySetup": false,
  "createdAt": "2026-01-03T12:00:00.000Z"
}
```

**Error Response (401 Unauthorized):**

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Unauthorized"
}
```

**Postman Tests:**

```javascript
if (pm.response.code === 200) {
  const response = pm.response.json();
  pm.environment.set('user_id', response.id);
}
```

---

### 6. Get Security Parameters

**Purpose:** Retrieve encryption parameters for client-side key derivation

```http
GET {{base_url}}/users/security
Authorization: Bearer {{access_token}}
```

**Response (Not Configured - 200 OK):**

```json
{
  "configured": false,
  "passwordSalt": null,
  "kdfParams": null
}
```

**Response (Configured - 200 OK):**

```json
{
  "configured": true,
  "passwordSalt": "c29tZS1yYW5kb20tc2FsdC1iYXNlNjQ=",
  "kdfParams": {
    "algorithm": "argon2id",
    "memory": 65536,
    "iterations": 3,
    "parallelism": 4,
    "hashLength": 32
  }
}
```

---

### 7. Setup Security Parameters

**Purpose:** Configure encryption parameters (one-time setup)

```http
POST {{base_url}}/users/security
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "passwordSalt": "c29tZS1yYW5kb20tc2FsdC1iYXNlNjQ=",
  "kdfParams": {
    "algorithm": "argon2id",
    "memory": 65536,
    "iterations": 3,
    "parallelism": 4,
    "hashLength": 32
  }
}
```

**Success Response (201 Created):**

```json
{
  "success": true,
  "message": "Security parameters configured successfully"
}
```

**Error Response (409 Conflict):**

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Security parameters already configured"
}
```

---

## 📁 Files

### 8. Create File (Initiate Upload)

**Purpose:** Create a file record and get a signed B2 upload URL

```http
POST {{base_url}}/files
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "fileNameEncrypted": "U2FsdGVkX1+abc123...encrypted_filename...",
  "mimeType": "image/jpeg",
  "sizeBytes": 1048576,
  "cipherFileKey": "U2FsdGVkX1+xyz789...encrypted_key..."
}
```

| Field               | Type   | Required | Description                                    |
| ------------------- | ------ | -------- | ---------------------------------------------- |
| `fileNameEncrypted` | string | ✅       | Original filename, encrypted by client         |
| `mimeType`          | string | ❌       | MIME type (e.g., image/jpeg)                   |
| `sizeBytes`         | number | ❌       | Size of encrypted file in bytes                |
| `cipherFileKey`     | string | ✅       | File encryption key, encrypted with master key |

**Success Response (201 Created):**

```json
{
  "fileId": "123e4567-e89b-12d3-a456-426614174000",
  "uploadUrl": "https://pod-XXX-XXX.backblaze.com/b2api/v2/b2_upload_file/...",
  "authorizationToken": "abc123xyz...",
  "b2FilePath": "users/user-id/2026/01/file-uuid.enc"
}
```

**Postman Tests:**

```javascript
if (pm.response.code === 201) {
  const response = pm.response.json();
  pm.environment.set('file_id', response.fileId);
}
```

**Client Workflow:**

1. Encrypt file locally with AES-256-GCM
2. Generate file key, encrypt it with user's master key
3. Call this endpoint with encrypted metadata
4. Upload encrypted file directly to B2 using `uploadUrl` and `authorizationToken`

---

### 9. Get File

**Purpose:** Get file metadata and signed download URL

```http
GET {{base_url}}/files/{{file_id}}
Authorization: Bearer {{access_token}}
```

**Success Response (200 OK):**

```json
{
  "fileId": "123e4567-e89b-12d3-a456-426614174000",
  "fileNameEncrypted": "U2FsdGVkX1+abc123...encrypted_filename...",
  "mimeType": "image/jpeg",
  "sizeBytes": 1048576,
  "cipherFileKey": "U2FsdGVkX1+xyz789...encrypted_key...",
  "downloadUrl": "https://f000.backblazeb2.com/file/bucket-name/...",
  "createdAt": "2026-01-03T12:00:00.000Z",
  "updatedAt": "2026-01-03T12:00:00.000Z"
}
```

**Error Response (404 Not Found):**

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "File not found"
}
```

**Error Response (403 Forbidden):**

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Access denied"
}
```

**Client Workflow:**

1. Call this endpoint to get download URL
2. Download encrypted file from B2 using `downloadUrl`
3. Decrypt `cipherFileKey` with master key
4. Decrypt file content with file key

---

### 10. List Files

**Purpose:** Get paginated list of user's files

```http
GET {{base_url}}/files?page=1&limit=50
Authorization: Bearer {{access_token}}
```

**Query Parameters:**

| Parameter | Type   | Default | Description              |
| --------- | ------ | ------- | ------------------------ |
| `page`    | number | 1       | Page number (1-based)    |
| `limit`   | number | 50      | Items per page (max 100) |

**Success Response (200 OK):**

```json
{
  "files": [
    {
      "fileId": "123e4567-e89b-12d3-a456-426614174000",
      "fileNameEncrypted": "U2FsdGVkX1+abc123...",
      "mimeType": "image/jpeg",
      "sizeBytes": 1048576,
      "createdAt": "2026-01-03T12:00:00.000Z",
      "updatedAt": "2026-01-03T12:00:00.000Z"
    },
    {
      "fileId": "987fcdeb-51a2-3d4e-b678-426614174001",
      "fileNameEncrypted": "U2FsdGVkX1+def456...",
      "mimeType": "image/png",
      "sizeBytes": 2097152,
      "createdAt": "2026-01-03T11:00:00.000Z",
      "updatedAt": "2026-01-03T11:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3
  }
}
```

---

### 11. Delete File

**Purpose:** Soft delete a file

```http
DELETE {{base_url}}/files/{{file_id}}
Authorization: Bearer {{access_token}}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "File deleted"
}
```

**Error Response (404 Not Found):**

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "File not found"
}
```

---

## 📂 Albums

### 12. Create Album

**Purpose:** Create a new album

```http
POST {{base_url}}/albums
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "titleEncrypted": "U2FsdGVkX1+abc123...encrypted_album_title..."
}
```

**Success Response (201 Created):**

```json
{
  "albumId": "123e4567-e89b-12d3-a456-426614174000",
  "titleEncrypted": "U2FsdGVkX1+abc123...encrypted_album_title...",
  "createdAt": "2026-01-03T12:00:00.000Z"
}
```

**Postman Tests:**

```javascript
if (pm.response.code === 201) {
  const response = pm.response.json();
  pm.environment.set('album_id', response.albumId);
}
```

---

### 13. List Albums

**Purpose:** Get all albums for the user

```http
GET {{base_url}}/albums
Authorization: Bearer {{access_token}}
```

**Success Response (200 OK):**

```json
{
  "albums": [
    {
      "albumId": "123e4567-e89b-12d3-a456-426614174000",
      "titleEncrypted": "U2FsdGVkX1+abc123...",
      "fileCount": 42,
      "createdAt": "2026-01-03T12:00:00.000Z"
    },
    {
      "albumId": "987fcdeb-51a2-3d4e-b678-426614174001",
      "titleEncrypted": "U2FsdGVkX1+def456...",
      "fileCount": 15,
      "createdAt": "2026-01-02T10:00:00.000Z"
    }
  ]
}
```

---

### 14. Get Album

**Purpose:** Get album details including file count

```http
GET {{base_url}}/albums/{{album_id}}
Authorization: Bearer {{access_token}}
```

**Success Response (200 OK):**

```json
{
  "albumId": "123e4567-e89b-12d3-a456-426614174000",
  "titleEncrypted": "U2FsdGVkX1+abc123...",
  "fileCount": 42,
  "createdAt": "2026-01-03T12:00:00.000Z"
}
```

**Error Response (404 Not Found):**

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Album not found"
}
```

---

### 15. Add Files to Album

**Purpose:** Add one or more files to an album

```http
POST {{base_url}}/albums/{{album_id}}/files
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "fileIds": [
    "123e4567-e89b-12d3-a456-426614174000",
    "987fcdeb-51a2-3d4e-b678-426614174001"
  ]
}
```

| Field     | Type     | Required | Description                       |
| --------- | -------- | -------- | --------------------------------- |
| `fileIds` | string[] | ✅       | Array of file UUIDs (1-100 items) |

**Success Response (200 OK):**

```json
{
  "success": true,
  "addedCount": 2,
  "message": "Added 2 files to album"
}
```

**Error Response (400 Bad Request):**

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "One or more files not found or not accessible"
}
```

---

### 16. List Album Files

**Purpose:** Get paginated list of files in an album

```http
GET {{base_url}}/albums/{{album_id}}/files?page=1&limit=50
Authorization: Bearer {{access_token}}
```

**Query Parameters:**

| Parameter | Type   | Default | Description              |
| --------- | ------ | ------- | ------------------------ |
| `page`    | number | 1       | Page number (1-based)    |
| `limit`   | number | 50      | Items per page (max 100) |

**Success Response (200 OK):**

```json
{
  "files": [
    {
      "fileId": "123e4567-e89b-12d3-a456-426614174000",
      "fileNameEncrypted": "U2FsdGVkX1+abc123...",
      "mimeType": "image/jpeg",
      "sizeBytes": 1048576,
      "orderIndex": 0,
      "createdAt": "2026-01-03T12:00:00.000Z"
    },
    {
      "fileId": "987fcdeb-51a2-3d4e-b678-426614174001",
      "fileNameEncrypted": "U2FsdGVkX1+def456...",
      "mimeType": "image/png",
      "sizeBytes": 2097152,
      "orderIndex": 1,
      "createdAt": "2026-01-03T11:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 42,
    "totalPages": 1
  }
}
```

---

### 17. Remove File from Album

**Purpose:** Remove a file from an album (does not delete the file)

```http
DELETE {{base_url}}/albums/{{album_id}}/files/{{file_id}}
Authorization: Bearer {{access_token}}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "File removed from album"
}
```

**Error Response (404 Not Found):**

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Album or file not found"
}
```

---

### 18. Delete Album

**Purpose:** Delete an album (files are not deleted)

```http
DELETE {{base_url}}/albums/{{album_id}}
Authorization: Bearer {{access_token}}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Album deleted"
}
```

**Error Response (404 Not Found):**

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Album not found"
}
```

---

## 🏥 Health Check

### 19. Health Check

**Purpose:** Verify API is running (no authentication required)

```http
GET {{base_url}}/health
```

**Success Response (200 OK):**

```json
{
  "status": "ok",
  "timestamp": "2026-01-03T12:00:00.000Z"
}
```

---

## 🔧 Error Responses

All error responses follow this consistent format:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Detailed error message"
}
```

### Common HTTP Status Codes

| Code | Status                | Description                             |
| ---- | --------------------- | --------------------------------------- |
| 200  | OK                    | Request succeeded                       |
| 201  | Created               | Resource created successfully           |
| 400  | Bad Request           | Invalid input data or validation failed |
| 401  | Unauthorized          | Missing or invalid authentication token |
| 403  | Forbidden             | Authenticated but not allowed to access |
| 404  | Not Found             | Resource does not exist                 |
| 409  | Conflict              | Resource already exists                 |
| 429  | Too Many Requests     | Rate limit exceeded                     |
| 500  | Internal Server Error | Server error                            |

---

## 🔐 Zero-Knowledge Architecture

### Key Concepts

1. **All encryption happens client-side** - Backend never sees plaintext data
2. **Backend stores only encrypted metadata** - Cannot decrypt filenames or content
3. **File keys are wrapped** - Each file has its own key, encrypted with user's master key
4. **Salt and KDF params stored server-side** - Used by client to derive master key from vault password

### Client Encryption Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT SIDE                               │
├─────────────────────────────────────────────────────────────────┤
│  1. User enters vault password                                   │
│  2. Fetch salt & KDF params from /users/security                │
│  3. Derive master key: masterKey = KDF(password, salt, params)  │
│  4. For each file:                                               │
│     a. Generate random file key                                  │
│     b. Encrypt file: encryptedFile = AES-GCM(file, fileKey)     │
│     c. Encrypt filename: encryptedName = AES-GCM(name, fileKey) │
│     d. Wrap file key: cipherFileKey = AES-GCM(fileKey, masterKey)│
│  5. Upload encrypted data to backend                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        SERVER SIDE                               │
├─────────────────────────────────────────────────────────────────┤
│  - Stores only encrypted blobs                                   │
│  - Cannot decrypt any user data                                  │
│  - Manages access control and signed URLs                        │
│  - Stores salt/KDF params (NOT the password or derived key)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Testing Workflow

### Complete Test Sequence

1. **Health Check** - Verify API is running
2. **Register** - Create new account
3. **Get Current User** - Verify registration
4. **Setup Security** - Configure encryption parameters
5. **Get Security** - Verify security setup
6. **Create File** - Get upload URL
7. **Upload to B2** - Upload encrypted file directly (external)
8. **Get File** - Verify file and get download URL
9. **List Files** - Verify file appears in list
10. **Create Album** - Create new album
11. **Add Files to Album** - Add file to album
12. **List Album Files** - Verify file in album
13. **Remove File from Album** - Remove file
14. **Delete Album** - Clean up album
15. **Delete File** - Clean up file
16. **Refresh Token** - Test token refresh

### Import Collection

You can import this as a Postman Collection by using the Swagger endpoint:

1. Open Postman
2. Click **Import** → **Link**
3. Enter: `http://localhost:3000/docs-json`
4. Import will create all endpoints automatically

---

## 🛡️ Security Notes

- **Tokens expire in 15 minutes** - Use refresh endpoint to get new tokens
- **Rate limiting is enabled** - Don't spam requests
- **HTTPS required in production** - All data encrypted in transit
- **UUIDs used for all IDs** - Not guessable or enumerable
- **Soft deletes** - Files are marked deleted, not immediately removed

---

## 📚 Additional Resources

- **Swagger UI**: http://localhost:3000/docs
- **OpenAPI JSON**: http://localhost:3000/docs-json
- **Zero-Knowledge Docs**: See `docs/ZERO_KNOWLEDGE.md`
- **API Architecture**: See `docs/API.md`
