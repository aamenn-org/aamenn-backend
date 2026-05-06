import {
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePlanDto {
  @ApiPropertyOptional({ description: 'Display name of the plan' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Storage in GB',
    minimum: 1,
    maximum: 10240,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10240)
  storageGb?: number;

  @ApiPropertyOptional({ description: 'Price in EGP', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceEgp?: number;

  @ApiPropertyOptional({ description: 'Duration in days', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({ description: 'Whether the plan is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
