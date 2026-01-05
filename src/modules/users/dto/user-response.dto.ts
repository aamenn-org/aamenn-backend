import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTO for current user
 */
export class CurrentUserResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  email: string;

  @ApiPropertyOptional({
    description: 'User display name',
    example: 'John Doe',
    nullable: true,
  })
  displayName: string | null;

  @ApiPropertyOptional({
    description: 'Authentication provider',
    example: 'local',
    enum: ['local', 'google'],
    nullable: true,
  })
  authProvider?: string | null;

  @ApiProperty({
    description: 'Whether user has set up security parameters',
    example: true,
  })
  hasSecuritySetup: boolean;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;
}

/**
 * KDF parameters for key derivation
 */
export class KdfParamsResponseDto {
  @ApiProperty({
    description: 'KDF algorithm (argon2id or pbkdf2)',
    example: 'argon2id',
  })
  algorithm: string;

  @ApiPropertyOptional({
    description: 'Number of iterations',
    example: 3,
  })
  iterations?: number;

  @ApiPropertyOptional({
    description: 'Memory cost in KB',
    example: 65536,
  })
  memory?: number;

  @ApiPropertyOptional({
    description: 'Parallelism factor',
    example: 4,
  })
  parallelism?: number;

  @ApiPropertyOptional({
    description: 'Hash length in bytes',
    example: 32,
  })
  hashLength?: number;
}

/**
 * Response DTO for user security parameters
 */
/**
 * Response DTO for user security parameters (zero-knowledge encryption)
 */
export class UserSecurityResponseDto {
  @ApiProperty({
    description: 'Whether security is configured',
    example: true,
  })
  configured: boolean;

  @ApiPropertyOptional({
    description: 'Master key encrypted with KEK (base64)',
    example: 'base64EncodedEncryptedMasterKey...',
    nullable: true,
  })
  encryptedMasterKey: string | null;

  @ApiPropertyOptional({
    description: 'Salt for KEK derivation (base64)',
    example: 'base64EncodedSalt...',
    nullable: true,
  })
  kekSalt: string | null;

  @ApiPropertyOptional({
    description: 'KDF parameters for KEK derivation',
    type: KdfParamsResponseDto,
    nullable: true,
  })
  kdfParams: KdfParamsResponseDto | null;
}

/**
 * Response DTO for security setup
 */
export class SecuritySetupResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Result message',
    example: 'Security parameters configured successfully',
  })
  message: string;
}
