import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsNotDisposableEmail } from '../../../common/validators/disposable-email.validator';

/**
 * DTO for requesting a signup email verification OTP.
 */
export class SendSignupOtpDto {
  @ApiProperty({
    description: 'User email address to verify',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  @IsNotDisposableEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'Cloudflare Turnstile CAPTCHA token',
  })
  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
