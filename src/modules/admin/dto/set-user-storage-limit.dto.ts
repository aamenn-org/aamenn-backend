import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetUserStorageLimitDto {
  @ApiProperty({
    description: 'Storage limit in gigabytes (1–2048)',
    minimum: 1,
    maximum: 2048,
    example: 10,
  })
  @IsInt()
  @Min(1)
  @Max(2048)
  storageLimitGb: number;
}
