import { IsString, IsNotEmpty, IsEmail, MinLength, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class KdfParamsDto {
  @IsString()
  @IsNotEmpty()
  algorithm: string;

  @IsOptional()
  iterations?: number;

  @IsOptional()
  memory?: number;

  @IsOptional()
  parallelism?: number;

  @IsOptional()
  hashLength?: number;
}

/**
 * Step 1: Request OTP for vault reset
 */
export class VaultResetRequestDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

/**
 * Step 2: Verify OTP and get reset session token
 */
export class VaultResetVerifyDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: '6-digit OTP sent to email' })
  @IsString()
  @IsNotEmpty()
  otp: string;
}

/**
 * Step 3: Fetch recovery params (requires reset session token)
 */
export class VaultResetParamsDto {
  @ApiProperty({ description: 'Reset session token from verify step' })
  @IsString()
  @IsNotEmpty()
  resetToken: string;
}

/**
 * Step 4: Complete vault reset with new password
 */
export class VaultResetCompleteDto {
  @ApiProperty({ description: 'Reset session token from verify step' })
  @IsString()
  @IsNotEmpty()
  resetToken: string;

  @ApiProperty({ description: 'New vault password (min 8 chars)', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;

  @ApiProperty({ description: 'Master key re-encrypted with new password-derived KEK (base64)' })
  @IsString()
  @IsNotEmpty()
  newEncryptedMasterKey: string;

  @ApiProperty({ description: 'New KEK salt (base64)' })
  @IsString()
  @IsNotEmpty()
  newKekSalt: string;

  @ApiPropertyOptional({ description: 'New KDF parameters', type: KdfParamsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => KdfParamsDto)
  newKdfParams?: KdfParamsDto;
}
