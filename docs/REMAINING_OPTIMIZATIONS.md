# Remaining Performance Optimizations

## Streaming Uploads (Not Implemented)

### Why Not Implemented
Implementing true streaming uploads would require significant architectural changes:

1. **Multipart Form Data Streaming**: NestJS's `FileInterceptor` buffers the entire file in memory by design
2. **B2 SDK Limitations**: The `backblaze-b2` SDK's `uploadFile` method expects a Buffer, not a stream
3. **SHA1 Hash Calculation**: Currently requires the full buffer to compute the hash before upload
4. **Breaking Change Risk**: Would require changing the upload API contract

### Current Memory Usage
- **Max File Size**: 500MB (configurable via `FileInterceptor` limits)
- **Concurrent Uploads**: Limited to 5 via p-limit (configurable via `B2_UPLOAD_CONCURRENCY`)
- **Memory Impact**: ~500MB per upload × 5 concurrent = ~2.5GB max memory usage

### Recommended Approach (If Needed)

If memory becomes an issue at scale, consider:

#### Option 1: Direct Client-to-B2 Upload (Recommended)
```typescript
// Client-side flow:
// 1. Request signed upload URL from backend
// 2. Upload encrypted file directly to B2 from browser
// 3. Notify backend of successful upload
// 4. Backend creates file record

// Benefits:
// - Zero backend memory usage for file data
// - Faster uploads (no proxy hop)
// - Better scalability
// - True zero-knowledge (backend never sees encrypted blob)

// Implementation:
// POST /files/request-upload → { uploadUrl, fileId }
// Client uploads to B2 directly
// POST /files/confirm-upload → { fileId, b2FileId }
```

#### Option 2: Streaming with Custom Implementation
```typescript
// Would require:
// 1. Custom multipart parser (e.g., busboy)
// 2. Stream-based SHA1 calculation
// 3. Direct stream to B2 (may need custom B2 upload logic)
// 4. Careful error handling for partial uploads

// Complexity: HIGH
// Benefit: Moderate (only helps with very large files)
// Risk: HIGH (potential for data corruption, partial uploads)
```

### Current Mitigation Strategies

✅ **Already Implemented:**
- Upload concurrency limiting (p-limit)
- File size limits (500MB max)
- Proper error handling and retries
- Memory-efficient thumbnail processing removed (client-side only)

✅ **Configuration Options:**
```bash
# Adjust these in .env if needed
B2_UPLOAD_CONCURRENCY=5  # Max concurrent uploads
# FileInterceptor limits in files.controller.ts:
# - fileSize: 500MB
# - fieldSize: 10MB
```

### When to Implement Streaming

Consider implementing streaming uploads if:
- [ ] Average file size > 100MB
- [ ] Concurrent users > 100
- [ ] Memory usage consistently > 80% during uploads
- [ ] OOM errors in production logs

### Alternative: Chunked Uploads

For very large files (>500MB), consider implementing chunked uploads:

```typescript
// Client splits file into chunks (e.g., 50MB each)
// Uploads each chunk separately
// Backend reassembles on completion

// Benefits:
// - Smaller memory footprint per chunk
// - Resume capability on network failure
// - Better progress tracking

// Complexity: MEDIUM
// B2 supports large file uploads via b2_start_large_file API
```

---

## Summary

**Streaming uploads are NOT critical** for the current architecture because:

1. **True E2EE Architecture**: Client-side encryption means files are already processed in the browser
2. **Direct Upload Option**: Client can upload directly to B2 (bypassing backend entirely)
3. **Reasonable Limits**: 500MB limit is adequate for most photo/video use cases
4. **Concurrency Control**: p-limit prevents memory exhaustion
5. **Scalability**: Horizontal scaling (multiple backend instances) is easier than streaming implementation

**Recommendation**: Monitor memory usage in production. If issues arise, implement **direct client-to-B2 uploads** before attempting streaming.
