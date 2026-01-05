import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountDto {
  @ApiProperty({
    description: 'Current password for verification',
    example: 'YourPassword123!',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
