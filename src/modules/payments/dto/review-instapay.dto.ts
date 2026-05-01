import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum InstapayReviewAction {
  APPROVE = 'approve',
  REJECT = 'reject',
}

export class ReviewInstapayDto {
  @ApiProperty({
    enum: InstapayReviewAction,
    description: 'Whether to approve or reject the InstaPay submission',
  })
  @IsEnum(InstapayReviewAction)
  action: InstapayReviewAction;

  @ApiPropertyOptional({
    description:
      'Note shown to the user (mandatory in spirit when rejecting, optional when approving)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;
}
