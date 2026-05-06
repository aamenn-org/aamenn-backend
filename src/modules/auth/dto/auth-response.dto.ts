import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTO for authentication endpoints
 *
 * For login: Returns encryptedMasterKey + kekSalt + kdfParams
 * Client uses these to derive KEK and decrypt the master key locally
 */
export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'JWT refresh token for obtaining new access tokens',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Access token expiration time in seconds',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Token type',
    example: 'Bearer',
  })
  tokenType: string;

  @ApiPropertyOptional({
    description:
      'Master key encrypted with KEK (base64). Client decrypts this locally.',
    example: 'base64EncodedEncryptedMasterKey...',
  })
  encryptedMasterKey?: string;

  @ApiPropertyOptional({
    description: 'Salt for KEK derivation (base64)',
    example: 'base64EncodedSalt...',
  })
  kekSalt?: string;

  @ApiPropertyOptional({
    description: 'KDF parameters for KEK derivation',
  })
  kdfParams?: Record<string, any>;
}

/**
 * Response for user registration
 */
export class RegisterResponseDto extends AuthResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  userId: string;
}
