<div align="center">

<br/>

# آمـن — AAMEEN Backend

**Zero-knowledge encrypted cloud storage API**

Built with NestJS · TypeScript · PostgreSQL · Backblaze B2

[![TypeScript](https://img.shields.io/badge/TypeScript-5.1-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](#license)

</div>

---

## Overview

This is the backend service for **AAMEEN** — a privacy-first, end-to-end encrypted cloud storage platform built for Arab and MENA-region users. The server is designed around a strict zero-knowledge principle: **we never see your files, never hold your keys.**

All files are encrypted on the client before they reach this server. The backend handles metadata, orchestrates signed upload/download URLs directly to Backblaze B2, and manages user accounts — nothing more.

---

## Architecture

```
Client                      AAMEEN Backend               Backblaze B2
  │                               │                            │
  ├── Encrypt file locally ────── │                            │
  ├── POST /files/upload-init ──▶ │                            │
  │                               ├── Issue signed URL ──────▶ │
  │◀─ Signed upload URL ───────── │                            │
  ├── PUT (encrypted bytes) ──────┼───────────────────────────▶│
  │                               │                            │
  ├── GET /files/:id ───────────▶ │                            │
  │                               ├── Verify ownership         │
  │◀─ Signed download URL ──────  │                            │
  ├── GET (encrypted bytes) ──────┼───────────────────────────▶│
  └── Decrypt locally ─────────── │                            │
```

The backend **never receives plaintext file content** and **never stores encryption keys**. Signed URLs expire in 5 minutes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 (Node.js) |
| Language | TypeScript 5 |
| Database | PostgreSQL 14+ via TypeORM |
| Storage | Backblaze B2 (S3-compatible) |
| Cache | Redis (via ioredis) |
| Auth | JWT + Google OAuth2 |
| Email | Nodemailer (SMTP) |
| Payments | Paymob (cards, wallets, Fawry) |
| CAPTCHA | Cloudflare Turnstile |
| Docs | Swagger / OpenAPI |

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Backblaze B2 account
- (Optional) Paymob account for payment processing

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/aamenn-org/aamenn-backend.git
cd aamenn-backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Then fill in `.env`. See the [Environment Variables](#environment-variables) section below for a full breakdown.

### 3. Set up the database

```bash
# Run all migrations
npm run migration:run

# (Optional) Seed an admin user
npm run seed:admin
```

### 4. Run the server

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000/api/v1`.  
Swagger docs at `http://localhost:3000/docs`.

### Docker (alternative)

```bash
docker compose up --build
```

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `NODE_ENV` | `development` or `production` | ✅ |
| `PORT` | Server port (default: `3000`) | ✅ |
| `DATABASE_HOST` | PostgreSQL host | ✅ |
| `DATABASE_PORT` | PostgreSQL port | ✅ |
| `DATABASE_USERNAME` | DB username | ✅ |
| `DATABASE_PASSWORD` | DB password | ✅ |
| `DATABASE_NAME` | DB name | ✅ |
| `JWT_ISSUER` | OAuth provider issuer URL | ✅ |
| `JWT_AUDIENCE` | API identifier | ✅ |
| `JWT_SECRET` | Symmetric signing secret (if not using JWKS) | ⚠️ |
| `JWKS_URI` | JWKS endpoint from auth provider | ✅ (prod) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | ✅ |
| `B2_APPLICATION_KEY_ID` | Backblaze B2 key ID | ✅ |
| `B2_APPLICATION_KEY` | Backblaze B2 application key | ✅ |
| `B2_BUCKET_ID` | B2 bucket ID | ✅ |
| `B2_BUCKET_NAME` | B2 bucket name | ✅ |
| `B2_SIGNED_URL_EXPIRATION` | Signed URL TTL in seconds (default: `300`) | ✅ |
| `STORAGE_LIMIT_GB` | Per-user storage quota in GB | ✅ |
| `SMTP_HOST` | SMTP server host | ✅ |
| `SMTP_USER` | SMTP username | ✅ |
| `SMTP_PASS` | SMTP password / app password | ✅ |
| `REDIS_HOST` | Redis host | ✅ |
| `REDIS_PORT` | Redis port | ✅ |
| `REDIS_PASSWORD` | Redis password | ⚠️ |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret | ✅ |
| `PAYMOB_API_KEY` | Paymob API key | 💳 |
| `PAYMOB_SECRET_KEY` | Paymob secret key | 💳 |
| `PAYMOB_HMAC_SECRET` | Paymob HMAC webhook secret | 💳 |
| `PAYMOB_CARD_INTEGRATION_ID` | Paymob card integration | 💳 |
| `PAYMOB_WALLET_INTEGRATION_ID` | Paymob mobile wallet integration | 💳 |
| `PAYMOB_FAWRY_INTEGRATION_ID` | Fawry integration | 💳 |
| `GRACE_PERIOD_DAYS` | Days grace after subscription expires | 💳 |

> 💳 = Required only if payments are enabled.

Full example in [`.env.example`](.env.example).

---

## API Reference

All endpoints are prefixed with `/api/v1` and require a valid JWT unless noted.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Register with email + password |
| `POST` | `/auth/login` | Login, receive JWT |
| `POST` | `/auth/google` | Google OAuth login |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | Invalidate session |

### Files

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/files/upload-init` | Get a signed B2 URL to upload an encrypted file |
| `GET` | `/files` | List all files for the authenticated user |
| `GET` | `/files/:id` | Get file metadata + signed download URL |
| `DELETE` | `/files/:id` | Soft-delete a file |

### Albums

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/albums` | Create an album |
| `GET` | `/albums` | List user's albums |
| `GET` | `/albums/:id` | Get album details |
| `POST` | `/albums/:id/files` | Add files to an album |
| `GET` | `/albums/:id/files` | List files in an album |
| `DELETE` | `/albums/:id/files/:fileId` | Remove a file from an album |
| `DELETE` | `/albums/:id` | Delete an album |

### Storage

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/storage/usage` | Get storage usage stats for the user |

Full interactive docs available via Swagger at `/docs` when the server is running.

---

## Database Migrations

```bash
# Generate a new migration from entity changes
npm run migration:generate -- --name=MigrationName

# Run all pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert
```

---

## Testing

```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov

# End-to-end tests
npm run test:e2e
```

---

## Utility Scripts

```bash
# Migrate files between B2 buckets
npm run migrate:b2:bucket

# Deduplicate files in B2
npm run deduplicate:b2

# Clear all data (use with extreme caution)
npm run clear:data
```

---

## Security

- All endpoints are JWT-protected
- Rate limiting is enforced on all routes via `@nestjs/throttler`
- HTTPS is enforced in production
- Signed B2 URLs expire after 5 minutes
- No plaintext file content is ever logged or stored
- Helmet middleware sets security-relevant HTTP headers
- VPN/datacenter IP detection via `IP_LOOKUP_ENABLED`
- Disposable email domains are blocked at registration

---

## Project Structure

```
src/
├── auth/           # JWT auth, Google OAuth, token guards
├── files/          # File metadata, B2 upload/download orchestration
├── albums/         # Album CRUD and file associations
├── storage/        # Per-user quota tracking
├── payments/       # Paymob integration (cards, wallets, Fawry)
├── users/          # User profiles and account management
├── email/          # Transactional email via Nodemailer
├── database/       # TypeORM data source, migrations, seeds
└── common/         # Shared guards, pipes, interceptors, decorators
```

---

## License

Proprietary — All rights reserved. © AAMEEN.
