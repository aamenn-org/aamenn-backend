/**
 * JWT Token Payload
 * Contains user identification data stored in the JWT
 */
export interface JwtPayload {
  /** User ID from auth provider */
  sub: string;
  /** User email */
  email?: string;
  /** Token issuer */
  iss: string;
  /** Token audience */
  aud?: string | string[];
  /** Expiration timestamp */
  exp: number;
  /** Issued at timestamp */
  iat: number;
}

/**
 * Authenticated User
 * User data extracted from validated JWT and attached to request
 */
export interface AuthenticatedUser {
  /** User's database ID */
  userId: string;
  /** User email */
  email?: string;
}

/**
 * Token response returned after authentication
 *
 * For login: Returns encrypted master key + KDF params
 * Client derives KEK locally and decrypts the master key
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  /** Master key encrypted with KEK (base64) - client decrypts locally */
  encryptedMasterKey?: string;
  /** Salt for KEK derivation (base64) */
  kekSalt?: string;
  /** KDF parameters for KEK derivation */
  kdfParams?: Record<string, any>;
}
