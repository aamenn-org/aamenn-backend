import { IsString, MinLength, IsNotEmpty, IsOptional, IsObject, ValidateNested, Matches } from 'class-validator';
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
 * DTO for changing vault password (logged-in user).
 * Client re-wraps the same masterKey with a new password-derived KEK.
 */
export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password for verification' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ description: 'New password (min 8 chars)', minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
  @Matches(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain at least one number' })
  @Matches(/[^A-Za-z0-9]/, { message: 'Password must contain at least one special character' })
  newPassword: string;

  @ApiProperty({ description: 'Master key re-encrypted with new KEK (base64)' })
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
