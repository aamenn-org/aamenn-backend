import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetUserStorageLimitDto {
  @ApiProperty({
    description: 'Storage limit in gigabytes (1–1024)',
    minimum: 1,
    maximum: 1024,
    example: 10,
  })
  @IsInt()
  @Min(1)
  @Max(1024)
  storageLimitGb: number;
}
