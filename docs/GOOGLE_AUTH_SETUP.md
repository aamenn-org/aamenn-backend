# Google Authentication Setup Guide

This guide explains how to set up Google Sign-In for the Aamenn application.

## Overview

Google Sign-In allows users to authenticate using their Google account. The implementation:
- Uses Google ID tokens for secure server-side verification
- Maintains zero-knowledge encryption (users still need a Vault Password)
- Supports account linking by verified email
- Issues standard JWT access/refresh tokens after verification
- Master key persists in localStorage (3-hour timeout) for seamless experience
- Google users can also login with email + Vault Password

## Prerequisites

- Google Cloud Console account
- Backend and frontend applications running

## Step 1: Create Google OAuth Client

### 1.1 Go to Google Cloud Console

Visit [Google Cloud Console](https://console.cloud.google.com/)

### 1.2 Create or Select a Project

- Click on the project dropdown at the top
- Create a new project or select an existing one

### 1.3 Enable Google+ API

- Go to **APIs & Services** > **Library**
- Search for "Google+ API"
- Click **Enable**

### 1.4 Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Configure consent screen if prompted:
   - User Type: **External**
   - App name: **Aamenn**
   - User support email: Your email
   - Developer contact: Your email
   - Save and continue through scopes and test users

4. Create OAuth Client ID:
   - Application type: **Web application**
   - Name: **Aamenn Web Client**
   
5. Add Authorized JavaScript origins:
   ```
   http://localhost:5173
   https://your-frontend-domain.com
   ```

6. Add Authorized redirect URIs:
   ```
   http://localhost:5173
   https://your-frontend-domain.com
   ```

7. Click **Create**

8. **Copy the Client ID** - you'll need this for both backend and frontend

## Step 2: Configure Backend

### 2.1 Update Environment Variables

Edit `Aamenn-Backend/.env`:

```env
# Add this line
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

### 2.2 Verify Configuration

The backend is already configured to use `GOOGLE_CLIENT_ID` from the environment.

Check `src/config/configuration.ts`:
```typescript
export const googleConfig = registerAs('google', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
}));
```

### 2.3 Restart Backend

```bash
npm run start:dev
```

## Step 3: Configure Frontend

### 3.1 Update Environment Variables

Edit `aamenn-frontend/.env`:

```env
VITE_API_URL=http://localhost:3000/api/v1
VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

**Important:** Use the **same Client ID** for both backend and frontend.

### 3.2 Verify Configuration

The frontend is already configured to use `VITE_GOOGLE_CLIENT_ID`.

Check `src/config/index.js`:
```javascript
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const config = {
  apiUrl: API_BASE_URL,
  appName: 'Aamenn',
  googleClientId: GOOGLE_CLIENT_ID,
};
```

### 3.3 Restart Frontend

```bash
npm run dev
```

## Step 4: Test Google Sign-In

### 4.1 Test on Login Page

1. Navigate to `http://localhost:5173/login`
2. Click **"Continue with Google"** button
3. Select a Google account
4. Grant permissions

### 4.2 Expected Behavior

**For New Users (First Google Login):**
- User is created in database
- `requiresVaultSetup: true` is returned
- User is prompted to create a Vault Password
- Master key is generated and stored in localStorage (3-hour timeout)
- After creating Vault Password, user can upload/download encrypted files

**For Returning Users:**
- User is authenticated
- `requiresVaultSetup: false` is returned
- If master key is still in localStorage (within 3 hours), no password needed
- If master key expired, user enters Vault Password to unlock
- After unlocking, user can access encrypted files

**For Admin Users:**
- No Vault Password required
- Redirected to admin dashboard

**Alternative Login (Email + Vault Password):**
- Google users can also login using email + Vault Password
- Backend finds user by email regardless of auth provider
- Client-side Vault Password verification
- Same seamless experience as Google Sign-In

### 4.3 Verify in Database

Check that user was created:

```sql
SELECT id, email, auth_provider_id, auth_provider, display_name 
FROM users 
WHERE auth_provider = 'google';
```

Expected result:
```
id: uuid
email: user@gmail.com
auth_provider_id: google:1234567890
auth_provider: google
display_name: User Name
```

## Step 5: Account Linking

### How It Works

If a user:
1. Registers with email `user@example.com` using local auth
2. Later signs in with Google using the same email `user@example.com`

The system will **link the accounts** because:
- Google email is verified (`email_verified: true`)
- Email matches existing user
- User can now login with either method

### Security Note

Account linking only works if Google email is verified. This prevents account takeover attacks.

## Troubleshooting

### Error: "Google authentication is not configured"

**Cause:** `GOOGLE_CLIENT_ID` not set in backend `.env`

**Solution:**
```bash
# In Aamenn-Backend/.env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Restart backend: `npm run start:dev`

### Error: "Invalid Google ID token"

**Causes:**
1. Client ID mismatch between frontend and backend
2. Token expired
3. Wrong audience

**Solution:**
- Ensure **same Client ID** in both `.env` files
- Check Google Cloud Console > Credentials
- Verify Authorized JavaScript origins include your frontend URL

### Error: "Email not verified by Google"

**Cause:** Google account email not verified

**Solution:** User must verify their email with Google first

### Google Button Not Showing

**Causes:**
1. `VITE_GOOGLE_CLIENT_ID` not set
2. Frontend not restarted after env change

**Solution:**
```bash
# In aamenn-frontend/.env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Restart frontend
npm run dev
```

### CORS Error

**Cause:** Frontend URL not in Authorized JavaScript origins

**Solution:**
1. Go to Google Cloud Console > Credentials
2. Edit OAuth Client ID
3. Add your frontend URL to **Authorized JavaScript origins**
4. Save

## Production Deployment

### Backend

1. Set `GOOGLE_CLIENT_ID` in production environment variables
2. No code changes needed

### Frontend

1. Set `VITE_GOOGLE_CLIENT_ID` in production build environment
2. Rebuild: `npm run build`
3. Deploy

### Google Cloud Console

1. Add production URLs to Authorized JavaScript origins:
   ```
   https://app.aamenn.com
   ```

2. Add production URLs to Authorized redirect URIs:
   ```
   https://app.aamenn.com
   ```

3. Submit app for verification if needed (for production use)

## Security Considerations

### What's Verified

✅ Google ID token signature  
✅ Token audience matches Client ID  
✅ Token issuer is Google  
✅ Token not expired  
✅ Email is verified by Google  

### What's NOT Stored

❌ Google access tokens  
❌ Google refresh tokens  
❌ Google user passwords  

### Zero-Knowledge Encryption

Google Sign-In is **only for authentication** (proving identity).

Encryption still requires a **Vault Password**:
- First time: User creates Vault Password
- Every login: User enters Vault Password to unlock vault

This maintains zero-knowledge encryption where the server never sees the master key.

## API Endpoint

### POST /auth/google

**Request:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6..."
}
```

**Response (New User):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "role": "user",
  "requiresVaultSetup": true
}
```

**Response (Existing User):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "role": "user",
  "encryptedMasterKey": "base64...",
  "kekSalt": "base64...",
  "kdfParams": {...},
  "requiresVaultSetup": false
}
```

## Support

For issues:
1. Check this guide's troubleshooting section
2. Verify all environment variables are set correctly
3. Check browser console for errors
4. Check backend logs for errors
5. Verify Google Cloud Console configuration

## References

- [Google Identity Documentation](https://developers.google.com/identity)
- [@react-oauth/google](https://www.npmjs.com/package/@react-oauth/google)
- [google-auth-library](https://www.npmjs.com/package/google-auth-library)
