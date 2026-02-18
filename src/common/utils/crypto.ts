/**
 * Server-side Crypto Utilities
 * 
 * This module provides server-side cryptographic functions for vault password verification.
 * It mirrors the client-side crypto utilities but works in Node.js environment.
 */

import * as crypto from 'crypto';

// KDF Configuration - must match frontend
const KDF_CONFIG = {
  algorithm: 'pbkdf2',
  iterations: 100000,
  hashLength: 32,
};

/**
 * Convert Base64 string to Buffer
 */
function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

/**
 * Convert Buffer to Base64 string
 */
function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Derive Key Encryption Key (KEK) from password using PBKDF2
 * KEK = PBKDF2(password, salt, 100000 iterations)
 */
export async function deriveKEK(password: string, saltBase64: string): Promise<Buffer> {
  const salt = base64ToBuffer(saltBase64);
  
  // Derive key using PBKDF2
  const derivedKey = crypto.pbkdf2Sync(
    password,
    salt,
    KDF_CONFIG.iterations,
    32, // 32 bytes = 256 bits
    'sha256'
  );

  return derivedKey;
}

/**
 * Decrypt Master Key with KEK
 */
export async function decryptMasterKey(encryptedMasterKeyBase64: string, kek: Buffer): Promise<Buffer> {
  const combined = base64ToBuffer(encryptedMasterKeyBase64);

  // Extract IV, ciphertext, and auth tag
  const iv = combined.slice(0, 12);
  const authTag = combined.slice(combined.length - 16); // GCM auth tag is 16 bytes
  const ciphertext = combined.slice(12, combined.length - 16);

  // Create decipher using AES-256-GCM
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  const decryptedChunks: Buffer[] = [];
  decryptedChunks.push(decipher.update(ciphertext));
  decryptedChunks.push(decipher.final());

  const masterKeyBytes = Buffer.concat(decryptedChunks);
  
  return masterKeyBytes;
}

/**
 * Encrypt Master Key with KEK (for testing/verification purposes)
 */
export async function encryptMasterKey(masterKeyBytes: Buffer, kek: Buffer): Promise<string> {
  // Generate IV (12 bytes for AES-GCM)
  const iv = crypto.randomBytes(12);

  // Create cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);

  // Encrypt
  const encryptedChunks: Buffer[] = [];
  encryptedChunks.push(cipher.update(masterKeyBytes));
  encryptedChunks.push(cipher.final());

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Combine IV + ciphertext + authTag
  const combined = Buffer.concat([iv, Buffer.concat(encryptedChunks), authTag]);

  return bufferToBase64(combined);
}
