# Zero-Knowledge Encryption Architecture

This document explains the zero-knowledge encryption architecture following industry best practices.

## Core Principles

1. **Password is NEVER stored in plaintext** - Only bcrypt hash for authentication
2. **Server stores only encrypted master key** - Cannot decrypt it
3. **All encryption happens client-side** - Server sees only encrypted blobs
4. **Keys exist only in memory** - Never persisted in localStorage/cookies

---

## 🔑 Key Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                     USER PASSWORD                            │
│              (used for auth AND encryption)                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼                               ▼
┌─────────────────┐             ┌─────────────────────┐
│  Server Auth    │             │  Key Encryption Key │
│  (bcrypt hash)  │             │  KEK = KDF(pwd,salt)│
└─────────────────┘             └──────────┬──────────┘
                                           │
                                           ▼
                               ┌─────────────────────┐
                               │  Decrypt Master Key │
                               │  MK = AES(EMK, KEK) │
                               └──────────┬──────────┘
                                           │
                                           ▼
                               ┌─────────────────────┐
                               │    Master Key       │
                               │  (encrypts all      │
                               │   file keys)        │
                               └──────────┬──────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
          ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
          │   File Key 1    │    │   File Key 2    │    │   File Key N    │
          │ (random AES-256)│    │ (random AES-256)│    │ (random AES-256)│
          └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
                   │                      │                      │
                   ▼                      ▼                      ▼
          ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
          │ Encrypted File 1│    │ Encrypted File 2│    │ Encrypted File N│
          └─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 📝 Registration Flow

```
Client                                          Server
──────                                          ──────
1. Generate random salt (16 bytes)
2. Derive KEK: PBKDF2(password, salt, 100k)
3. Generate random Master Key (32 bytes)
4. Encrypt MK: encryptedMasterKey = AES-GCM(MK, KEK)
5. Send: email, password, encryptedMasterKey,  ──────►
         kekSalt, kdfParams
                                               6. Hash password with bcrypt
                                               7. Store user + encrypted data
                                               8. Return JWT tokens
◄──────────────────────────────────────────────
9. Store Master Key in memory (NOT localStorage)
```

### What Server Stores:

```json
{
  "email": "user@example.com",
  "passwordHash": "$2b$12$...", // bcrypt hash
  "encryptedMasterKey": "base64...", // Can't decrypt this!
  "kekSalt": "base64...", // Public parameter
  "kdfParams": {
    "algorithm": "pbkdf2",
    "iterations": 100000,
    "hashLength": 32
  }
}
```

---

## 🔐 Login Flow

```
Client                                          Server
──────                                          ──────
1. Send: email, password                ──────►
                                               2. Verify password vs bcrypt hash
                                               3. Return: JWT, encryptedMasterKey,
                                                         kekSalt, kdfParams
◄──────────────────────────────────────────────
4. Derive KEK: PBKDF2(password, kekSalt, 100k)
5. Decrypt: masterKey = AES-GCM-decrypt(encryptedMasterKey, KEK)
6. Store Master Key in memory only
```

### Important Notes:

- Master Key exists **only in browser memory**
- Closing tab = Master Key is lost
- User must re-login to derive it again

---

## 📁 File Encryption Flow

```
Client                                          Server (Proxy to B2)
──────                                          ──────────────────────
1. Generate random fileKey (32 bytes)
2. Encrypt file: ciphertext = AES-GCM(file, fileKey)
3. Encrypt filename: encName = AES-GCM(name, fileKey)
4. Wrap key: cipherFileKey = AES-GCM(fileKey, masterKey)
5. Upload: file, cipherFileKey, encName  ──────►
                                               6. Store encrypted blob in B2
                                               7. Store metadata in DB
                                               8. Return: fileId
◄──────────────────────────────────────────────
```

### Data Format:

```
Encrypted File: [12-byte IV][ciphertext][16-byte auth tag]
Encrypted Name: [12-byte IV][ciphertext][16-byte auth tag]
Wrapped Key:    [12-byte IV][ciphertext][16-byte auth tag]
```

---

## 📥 File Download Flow

```
Client                                          Server
──────                                          ──────
1. Request file by ID                   ──────►
                                               2. Return: cipherFileKey, encName,
                                                         downloadUrl
◄──────────────────────────────────────────────
3. Download encrypted file from B2
4. Unwrap: fileKey = AES-GCM-decrypt(cipherFileKey, masterKey)
5. Decrypt: file = AES-GCM-decrypt(ciphertext, fileKey)
6. Decrypt: filename = AES-GCM-decrypt(encName, fileKey)
7. Display to user
```

---

## 🔒 What Server Can See

| Data         | Server Can See? | Notes                            |
| ------------ | --------------- | -------------------------------- |
| Email        | ✅ Yes          | For authentication               |
| Password     | ❌ No           | Only bcrypt hash                 |
| Master Key   | ❌ No           | Only encrypted version           |
| KEK          | ❌ No           | Never transmitted                |
| File Key     | ❌ No           | Only wrapped version             |
| File Content | ❌ No           | Only encrypted blob              |
| Filename     | ❌ No           | Only encrypted                   |
| File Size    | ✅ Yes          | Encrypted size (slightly larger) |
| MIME Type    | ✅ Yes          | Stored for client convenience    |
| Timestamps   | ✅ Yes          | Upload/modify times              |

---

## 🛡️ Security Properties

### Zero-Knowledge Guarantees

- Server **cannot** decrypt user files
- Server **cannot** recover master key
- Server **cannot** forge file authenticity (AES-GCM provides authentication)
- Compromise of server database does NOT expose file contents

### What a Database Breach Exposes

- Email addresses
- Password hashes (bcrypt - computationally expensive to crack)
- **Encrypted** master keys (useless without passwords)
- **Encrypted** files (useless without master keys)

### Attack Scenarios

| Attack               | Protected? | Reason                          |
| -------------------- | ---------- | ------------------------------- |
| Server breach        | ✅         | All data encrypted              |
| Man-in-middle        | ✅         | HTTPS + AES-GCM integrity       |
| Brute force password | ⚠️ Slow    | bcrypt + PBKDF2 100k iterations |
| Password reuse       | ❌         | Use unique password!            |
| Device compromise    | ❌         | Keys in memory during session   |

---

## ⚠️ Limitations

### No Password Recovery

If user forgets password:

- Master Key cannot be derived
- All files are **permanently inaccessible**
- This is by design (true zero-knowledge)

### No Server-Side Search

Server cannot:

- Search file contents
- Search filenames
- Provide thumbnails (unless client uploads encrypted thumbnails separately)

### Session-Based Keys

- Master Key exists only while logged in
- Closing browser = must login again
- No "remember me" for encryption keys

---

## 🔧 Technical Details

### Algorithms Used

| Purpose          | Algorithm     | Key Size | Notes                   |
| ---------------- | ------------- | -------- | ----------------------- |
| Password hashing | bcrypt        | -        | 12 rounds, server-side  |
| KEK derivation   | PBKDF2-SHA256 | 256-bit  | 100,000 iterations      |
| Encryption       | AES-256-GCM   | 256-bit  | 12-byte IV, 16-byte tag |

### Why PBKDF2 over Argon2?

- Native browser support via WebCrypto API
- No external dependencies
- 100k iterations provides good security
- Argon2 requires additional libraries in browser

### IV/Nonce Generation

- All IVs are 12 bytes (96 bits)
- Generated using `crypto.getRandomValues()`
- Never reused for same key

---

## 📊 Database Schema

```sql
-- User security (zero-knowledge)
CREATE TABLE user_security (
  user_id UUID PRIMARY KEY,
  encrypted_master_key TEXT NOT NULL,  -- Can't decrypt!
  kek_salt TEXT NOT NULL,              -- Public parameter
  kdf_params JSONB NOT NULL            -- Public parameters
);

-- Files (all sensitive data encrypted)
CREATE TABLE files (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  b2_file_path TEXT NOT NULL,          -- Where blob is stored
  cipher_file_key TEXT NOT NULL,       -- Wrapped with master key
  file_name_encrypted TEXT NOT NULL,   -- Encrypted filename
  mime_type TEXT,                      -- Unencrypted (convenience)
  size_bytes BIGINT                    -- Encrypted size
);
```

---

## 🧪 Testing Zero-Knowledge

To verify the implementation:

1. **Register a user** - Check DB only has encrypted master key
2. **Upload a file** - Check B2 has encrypted blob, DB has wrapped key
3. **Dump database** - Verify no plaintext data visible
4. **Forget password** - Verify data is unrecoverable
5. **Change password** - Must re-encrypt master key (not implemented yet)

---

## 🔮 Future Enhancements

### Password Change

Re-encrypt master key with new KEK:

1. Derive old KEK, decrypt master key
2. Derive new KEK, encrypt master key
3. Update server with new encrypted master key

### Recovery Key

Generate recovery key during signup:

1. Generate random recovery key
2. Encrypt master key with recovery key
3. User writes down recovery key
4. Store encrypted backup on server

### Sharing (Complex)

Would require:

- Per-album keys
- Public key cryptography
- Key exchange protocols
