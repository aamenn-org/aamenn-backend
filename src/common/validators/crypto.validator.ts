import { BadRequestException } from '@nestjs/common';

/**
 * Validates encrypted data format and cryptographic parameters
 * Even though backend cannot decrypt, it should enforce crypto best practices
 */
export class CryptoValidator {
  /**
   * Validate IV/nonce for AES-GCM encryption
   * AES-GCM requires 12-byte (96-bit) IV for optimal security
   */
  static validateAesGcmIv(ivBase64: string): void {
    if (!ivBase64) {
      throw new BadRequestException('IV is required for encrypted data');
    }

    // Decode base64 to get actual IV bytes
    let ivBuffer: Buffer;
    try {
      ivBuffer = Buffer.from(ivBase64, 'base64');
    } catch (error) {
      throw new BadRequestException('Invalid base64 encoding for IV');
    }

    // AES-GCM standard IV length is 12 bytes (96 bits)
    if (ivBuffer.length !== 12) {
      throw new BadRequestException(
        `Invalid IV length: expected 12 bytes, got ${ivBuffer.length} bytes. ` +
        'AES-GCM requires 12-byte IV for optimal security.'
      );
    }
  }

  /**
   * Validate encrypted data format (IV + ciphertext + auth tag)
   * Expected format for AES-GCM: base64(IV || ciphertext || authTag)
   * - IV: 12 bytes
   * - Auth tag: 16 bytes
   * - Ciphertext: variable length
   */
  static validateEncryptedDataFormat(encryptedDataBase64: string, minSize = 28): void {
    if (!encryptedDataBase64) {
      throw new BadRequestException('Encrypted data is required');
    }

    let dataBuffer: Buffer;
    try {
      dataBuffer = Buffer.from(encryptedDataBase64, 'base64');
    } catch (error) {
      throw new BadRequestException('Invalid base64 encoding for encrypted data');
    }

    // Minimum size: 12 bytes IV + 16 bytes auth tag = 28 bytes
    if (dataBuffer.length < minSize) {
      throw new BadRequestException(
        `Encrypted data too small: expected at least ${minSize} bytes (IV + auth tag), got ${dataBuffer.length} bytes`
      );
    }
  }

  /**
   * Validate encrypted field size limits
   */
  static validateEncryptedFieldSize(
    fieldName: string,
    encryptedDataBase64: string,
    maxSizeBytes: number
  ): void {
    if (!encryptedDataBase64) {
      return; // Optional field
    }

    let dataBuffer: Buffer;
    try {
      dataBuffer = Buffer.from(encryptedDataBase64, 'base64');
    } catch (error) {
      throw new BadRequestException(`Invalid base64 encoding for ${fieldName}`);
    }

    if (dataBuffer.length > maxSizeBytes) {
      throw new BadRequestException(
        `${fieldName} exceeds maximum size of ${maxSizeBytes} bytes (got ${dataBuffer.length} bytes)`
      );
    }
  }

  /**
   * Validate base64 format
   */
  static validateBase64Format(data: string, fieldName: string): void {
    if (!data) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    // Base64 regex pattern
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    
    if (!base64Regex.test(data)) {
      throw new BadRequestException(`${fieldName} must be valid base64 encoded data`);
    }

    // Try to decode to verify it's valid
    try {
      Buffer.from(data, 'base64');
    } catch (error) {
      throw new BadRequestException(`${fieldName} contains invalid base64 data`);
    }
  }

  /**
   * Validate hex format (for hashes)
   */
  static validateHexFormat(data: string, fieldName: string, expectedLength?: number): void {
    if (!data) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    const hexRegex = /^[a-fA-F0-9]+$/;
    
    if (!hexRegex.test(data)) {
      throw new BadRequestException(`${fieldName} must be valid hexadecimal data`);
    }

    if (expectedLength && data.length !== expectedLength) {
      throw new BadRequestException(
        `${fieldName} must be ${expectedLength} characters, got ${data.length}`
      );
    }
  }

  /**
   * Validate KDF parameters for security
   */
  static validateKdfParams(kdfParams: any): void {
    if (!kdfParams || typeof kdfParams !== 'object') {
      throw new BadRequestException('KDF parameters are required');
    }

    const { algorithm, iterations, memory, parallelism } = kdfParams;

    if (!algorithm) {
      throw new BadRequestException('KDF algorithm is required');
    }

    // Validate PBKDF2 parameters
    if (algorithm.toLowerCase() === 'pbkdf2') {
      if (!iterations || iterations < 100000) {
        throw new BadRequestException(
          'PBKDF2 requires at least 100,000 iterations for security'
        );
      }
    }

    // Validate Argon2 parameters
    if (algorithm.toLowerCase().includes('argon2')) {
      if (!memory || memory < 65536) {
        throw new BadRequestException(
          'Argon2 requires at least 64MB (65536 KB) memory for security'
        );
      }
      if (!parallelism || parallelism < 1) {
        throw new BadRequestException(
          'Argon2 requires parallelism parameter (recommended: 4)'
        );
      }
    }
  }
}
