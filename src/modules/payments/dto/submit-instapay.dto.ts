import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for a user submitting InstaPay payment proof.
 *
 * The screenshot file is sent as a multipart `screenshot` field; this DTO covers
 * the remaining text form fields. Server enforces PNG/JPEG and ≤ 5 MB on the file.
 */
export class SubmitInstapayDto {
  @ApiProperty({
    description: 'UUID of the plan being paid for',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  planId: string;

  @ApiProperty({
    description: 'InstaPay transaction reference number',
    example: 'IPN-2026-04-30-XYZ123',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  instapayReference: string;

  @ApiPropertyOptional({
    description: 'Name on the sender InstaPay account (helps verification)',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  senderName?: string;
}
