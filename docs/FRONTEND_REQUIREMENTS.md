# CRITICAL: Frontend Changes Required for True E2EE

## Overview
The backend has been updated to **remove all server-side thumbnail generation** to restore true end-to-end encryption. The backend will **NEVER** receive plaintext image data.

## Required Frontend Changes

### 1. Client-Side Thumbnail Generation (MANDATORY)

The frontend MUST generate all thumbnails client-side before encryption:

```typescript
// Example implementation using browser Canvas API
async function generateThumbnails(file: File): Promise<ThumbnailSet> {
  const img = await loadImage(file);
  
  return {
    small: await resizeImage(img, 150, 150),      // 150x150
    medium: await resizeImage(img, 800, 800),     // 800x800
    large: await resizeImage(img, 1600, 1600),    // 1600x1600
    blurhash: await generateBlurhash(img),
    width: img.width,
    height: img.height,
  };
}
```

### 2. Encryption Flow (MANDATORY)

```typescript
async function uploadFile(file: File, masterKey: CryptoKey) {
  // 1. Generate thumbnails from PLAINTEXT image
  const thumbnails = await generateThumbnails(file);
  
  // 2. Generate unique encryption keys for each blob
  const fileKey = crypto.getRandomValues(new Uint8Array(32));
  const thumbSmallKey = crypto.getRandomValues(new Uint8Array(32));
  const thumbMediumKey = crypto.getRandomValues(new Uint8Array(32));
  const thumbLargeKey = crypto.getRandomValues(new Uint8Array(32));
  
  // 3. Encrypt ALL blobs
  const encryptedFile = await encryptBlob(file, fileKey);
  const encryptedThumbSmall = await encryptBlob(thumbnails.small, thumbSmallKey);
  const encryptedThumbMedium = await encryptBlob(thumbnails.medium, thumbMediumKey);
  const encryptedThumbLarge = await encryptBlob(thumbnails.large, thumbLargeKey);
  
  // 4. Wrap encryption keys with master key
  const cipherFileKey = await wrapKey(fileKey, masterKey);
  const cipherThumbSmallKey = await wrapKey(thumbSmallKey, masterKey);
  const cipherThumbMediumKey = await wrapKey(thumbMediumKey, masterKey);
  const cipherThumbLargeKey = await wrapKey(thumbLargeKey, masterKey);
  
  // 5. Upload ONLY encrypted blobs to backend
  const formData = new FormData();
  formData.append('file', encryptedFile);
  formData.append('thumbSmall', base64Encode(encryptedThumbSmall));
  formData.append('thumbMedium', base64Encode(encryptedThumbMedium));
  formData.append('thumbLarge', base64Encode(encryptedThumbLarge));
  formData.append('cipherFileKey', cipherFileKey);
  formData.append('cipherThumbSmallKey', cipherThumbSmallKey);
  formData.append('cipherThumbMediumKey', cipherThumbMediumKey);
  formData.append('cipherThumbLargeKey', cipherThumbLargeKey);
  formData.append('blurhash', thumbnails.blurhash);
  formData.append('width', thumbnails.width.toString());
  formData.append('height', thumbnails.height.toString());
  
  await fetch('/api/v1/files/upload', {
    method: 'POST',
    body: formData,
  });
}
```

### 3. Backend Upload Endpoint Changes

The backend `/api/v1/files/upload` endpoint now:
- **Accepts ONLY encrypted blobs** (file + 3 thumbnails)
- **Never processes plaintext images**
- **Validates size limits on encrypted data**
- **Stores encrypted blobs as-is to B2**

### 4. Size Limits (Enforced by Backend)

```typescript
// Backend enforces these limits on ENCRYPTED data
const LIMITS = {
  file: 500 * 1024 * 1024,        // 500MB
  thumbSmall: 500 * 1024,         // 500KB
  thumbMedium: 2 * 1024 * 1024,   // 2MB
  thumbLarge: 10 * 1024 * 1024,   // 10MB
};
```

### 5. Required Libraries

Recommended client-side libraries:
- **Image Processing**: `browser-image-compression` or Canvas API
- **Blurhash**: `blurhash` npm package
- **Encryption**: Web Crypto API (native)

### 6. Validation Requirements

Frontend MUST validate:
- Image dimensions before thumbnail generation
- Thumbnail sizes before encryption
- Encrypted blob sizes before upload
- File types (MIME validation)

## Backend Guarantees

✅ **Backend NEVER sees plaintext image data**  
✅ **Backend NEVER decrypts any user data**  
✅ **Backend stores ONLY encrypted blobs**  
✅ **Backend validates ONLY encrypted data size/format**  

## Migration Path

For existing users with server-generated thumbnails:
1. Backend will continue to serve existing thumbnails
2. New uploads MUST use client-side generation
3. Optional: Re-upload old files with client-side thumbnails

## Testing Checklist

- [ ] Thumbnails generated client-side
- [ ] All blobs encrypted before upload
- [ ] Backend receives only encrypted data
- [ ] Thumbnails decrypt correctly on download
- [ ] Blurhash displays correctly
- [ ] Size limits enforced
- [ ] Error handling for failed thumbnail generation
- [ ] Progress indicators for encryption/upload

## Security Verification

To verify true E2EE:
1. Inspect network traffic - should see only encrypted blobs
2. Check backend logs - should see no image processing
3. Verify Sharp library removed from backend dependencies
4. Confirm backend cannot decrypt any user data

## Questions?

Contact backend team if:
- Encryption format needs clarification
- Size limits need adjustment
- Additional metadata fields needed
- Performance optimization required
