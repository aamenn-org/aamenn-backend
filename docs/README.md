# Encrypted Photo Vault - Backend

Zero-knowledge encrypted photo storage backend built with NestJS.

## Features

- **Zero-Knowledge Architecture**: Backend never sees plaintext photos or encryption keys
- **JWT Authentication**: Validates tokens from OAuth2/OIDC providers (Auth0, Clerk, Supabase)
- **Backblaze B2 Integration**: Secure file storage with signed URLs
- **PostgreSQL**: Metadata and encrypted key storage only

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Backblaze B2 Account

## Installation

```bash
npm install
```

## Configuration

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Required environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret (or use JWKS from auth provider)
- `JWT_ISSUER` - Auth provider issuer URL
- `B2_APPLICATION_KEY_ID` - Backblaze B2 key ID
- `B2_APPLICATION_KEY` - Backblaze B2 application key
- `B2_BUCKET_ID` - Backblaze B2 bucket ID
- `B2_BUCKET_NAME` - Backblaze B2 bucket name

## Database Setup

Run migrations:

```bash
npm run migration:run
```

## Running the App

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Endpoints

### Files

- `POST /files/upload-init` - Initialize file upload, get signed B2 URL
- `GET /files/:id` - Get file metadata and signed download URL
- `GET /files` - List user's files
- `DELETE /files/:id` - Soft delete a file

### Albums

- `POST /albums` - Create an album
- `GET /albums` - List user's albums
- `GET /albums/:id` - Get album details
- `POST /albums/:id/files` - Add files to album
- `GET /albums/:id/files` - List files in album
- `DELETE /albums/:id/files/:fileId` - Remove file from album
- `DELETE /albums/:id` - Delete album

## Security

- All endpoints require valid JWT authentication
- Rate limiting enabled on all endpoints
- HTTPS enforced in production
- No plaintext data logging
- Signed URLs expire in 5 minutes

## Architecture

```
Client                    Backend                   B2
  |                          |                       |
  |-- Encrypt file locally --|                       |
  |-- POST /upload-init ---->|                       |
  |                          |-- Create record ----->|
  |<-- Signed URL -----------|                       |
  |-- Upload encrypted ------|---------------------->|
  |                          |                       |
  |-- GET /files/:id ------->|                       |
  |                          |-- Verify ownership ---|
  |<-- Signed download URL --|                       |
  |-- Download encrypted ----|---------------------->|
  |-- Decrypt locally -------|                       |
```

## License

UNLICENSED
