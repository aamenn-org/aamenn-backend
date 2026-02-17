import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsObject,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * KDF parameters for key derivation
 */
class KdfParamsDto {
  @ApiProperty({
    description: 'KDF algorithm (pbkdf2 recommended for browser)',
    example: 'pbkdf2',
  })
  @IsString()
  @IsNotEmpty()
  algorithm: string;

  @ApiPropertyOptional({
    description: 'Number of iterations (min 100000 for PBKDF2)',
    example: 100000,
  })
  @IsOptional()
  iterations?: number;

  @ApiPropertyOptional({
    description: 'Memory cost in KB (for argon2)',
    example: 65536,
  })
  @IsOptional()
  memory?: number;

  @ApiPropertyOptional({
    description: 'Parallelism factor (for argon2)',
    example: 4,
  })
  @IsOptional()
  parallelism?: number;

  @ApiPropertyOptional({
    description: 'Hash length in bytes',
    example: 32,
  })
  @IsOptional()
  hashLength?: number;
}

/**
 * DTO for user registration (Zero-Knowledge Encryption)
 *
 * Best Practice Flow:
 * 1. Client generates random salt (kekSalt)
 * 2. Client derives KEK from password: KEK = KDF(password, kekSalt)
 * 3. Client generates random Master Key (32 bytes)
 * 4. Client encrypts Master Key: encryptedMasterKey = AES-GCM(masterKey, KEK)
 * 5. Client sends: email, password (for auth only), encryptedMasterKey, kekSalt, kdfParams
 *
 * Server stores encryptedMasterKey but can NEVER decrypt it (doesn't know KEK)
 */
export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description:
      'User password (min 8 characters) - used for server auth AND client-side KEK derivation',
    example: 'SecurePass123!',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiProperty({
    description:
      'Master key encrypted with KEK, base64 encoded. Format: IV(12 bytes) + ciphertext + authTag(16 bytes)',
    example: 'base64EncodedEncryptedMasterKey...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000) // Reasonable limit for base64 encrypted master key
  encryptedMasterKey: string;

  @ApiProperty({
    description: 'Salt for KEK derivation, base64 encoded (minimum 16 bytes recommended)',
    example: 'base64EncodedSalt...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000) // Reasonable limit for base64 salt
  kekSalt: string;

  @ApiProperty({
    description: 'KDF parameters for KEK derivation',
    type: KdfParamsDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => KdfParamsDto)
  kdfParams: KdfParamsDto;

  @ApiPropertyOptional({
    description: 'User display name (optional)',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  displayName?: string;
}
