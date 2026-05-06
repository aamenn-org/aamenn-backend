# How to Run CLIENT_ENCRYPTION_EXAMPLE.html

## ⚠️ IMPORTANT: Don't Open the File Directly!

The HTML file **MUST** be served through an HTTP server. Opening it directly (double-clicking) uses `file://` protocol, which B2 CORS blocks.

## Quick Start

### Option 1: Using Python (Easiest)

```powershell
cd docs
python -m http.server 8080
```

Then open in browser: **http://localhost:8080/CLIENT_ENCRYPTION_EXAMPLE.html**

### Option 2: Using npx (Node.js)

```powershell
cd docs
npx serve .
```

Then open the URL shown (usually http://localhost:3000)

### Option 3: Using VS Code Live Server Extension

1. Install "Live Server" extension in VS Code
2. Right-click on CLIENT_ENCRYPTION_EXAMPLE.html
3. Select "Open with Live Server"

## Why This Is Required

When you open an HTML file directly from your filesystem:

- Browser uses `file://` protocol
- Origin becomes `null`
- B2 CORS blocks `null` origin (security restriction)

When served via HTTP:

- Browser uses `http://localhost:8080` as origin
- B2 CORS allows `localhost` origins
- File uploads work! ✅

## Testing the Upload

1. Start the server (use one of the options above)
2. Open http://localhost:8080/CLIENT_ENCRYPTION_EXAMPLE.html
3. Click "Login" (uses default credentials)
4. Click "Setup Security" (first time only)
5. Click "Derive Encryption Keys"
6. Select a file and click "Encrypt & Upload"
7. File will be encrypted client-side and uploaded to B2! 🎉
