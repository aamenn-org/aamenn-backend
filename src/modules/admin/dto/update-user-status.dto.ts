import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiPropertyOptional({ description: 'Enable or disable user account' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
