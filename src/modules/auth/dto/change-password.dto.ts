import { IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password for verification',
    example: 'OldPassword123!',
  })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    description: 'New password',
    example: 'NewPassword456!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  newPassword: string;

  @ApiProperty({
    description: 'New encrypted master key (re-encrypted with new KEK)',
    example: 'base64-encoded-encrypted-master-key',
  })
  @IsString()
  @IsNotEmpty()
  newEncryptedMasterKey: string;

  @ApiProperty({
    description: 'New KEK salt (generated for new password)',
    example: 'base64-encoded-salt',
  })
  @IsString()
  @IsNotEmpty()
  newKekSalt: string;
}
