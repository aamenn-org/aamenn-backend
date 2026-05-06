import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token (credential) from Google Sign-In',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiProperty({
    description: 'Google OAuth access token for API access (optional, for contacts sync)',
    example: 'ya29.a0AfH6SMBx...',
    required: false,
  })
  @IsString()
  @IsOptional()
  accessToken?: string;
}
