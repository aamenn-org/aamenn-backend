import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '../../../database/entities/subscription.entity';
import { PaymentStatus } from '../../../database/entities/payment.entity';

export class PlanResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() displayName: string;
  @ApiProperty() storageGb: number;
  @ApiProperty() priceEgp: number;
  @ApiProperty() durationDays: number;
}

export class SubscriptionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() planId: string;
  @ApiProperty({ enum: SubscriptionStatus }) status: SubscriptionStatus;
  @ApiProperty() currentPeriodStart: Date;
  @ApiProperty() currentPeriodEnd: Date;
  @ApiPropertyOptional() graceEndsAt: Date | null;
  @ApiPropertyOptional() plan: PlanResponseDto;
}

export class PaymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() planId: string;
  @ApiProperty() amountPiasters: number;
  @ApiProperty() currency: string;
  @ApiProperty({ enum: PaymentStatus }) status: PaymentStatus;
  @ApiPropertyOptional() paymentMethod: string | null;
  @ApiPropertyOptional() paidAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional() plan: PlanResponseDto;
}

export class CheckoutResponseDto {
  @ApiProperty() checkoutUrl: string;
  @ApiProperty() paymentId: string;
}
