import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsObject,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * KDF parameters for Key Encryption Key (KEK) derivation
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
 * DTO for setting up user security parameters (zero-knowledge encryption)
 *
 * The encryptedMasterKey is the user's random master key encrypted with their KEK.
 * KEK is derived from password + kekSalt using the KDF.
 * Server can NEVER decrypt the master key.
 */
export class CreateUserSecurityDto {
  @ApiProperty({
    description:
      'Master key encrypted with KEK, base64 encoded. Format: IV(12 bytes) + ciphertext + authTag',
    example: 'base64EncodedEncryptedMasterKey...',
  })
  @IsString()
  @IsNotEmpty()
  encryptedMasterKey: string;

  @ApiProperty({
    description: 'Salt for KEK derivation (base64)',
    example: 'base64EncodedSalt...',
  })
  @IsString()
  @IsNotEmpty()
  kekSalt: string;

  @ApiProperty({
    description: 'KDF parameters for KEK derivation',
    type: KdfParamsDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => KdfParamsDto)
  kdfParams: KdfParamsDto;
}
