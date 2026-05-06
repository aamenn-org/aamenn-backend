import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

export interface PaymobIntentionPayload {
  amount: number; // in piasters
  currency: string;
  paymentMethods: number[]; // integration IDs
  billingData: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
  };
  extras: Record<string, string>;
}

export interface PaymobIntentionResponse {
  intention_id: string;
  client_secret: string;
  payment_keys: Array<{
    integration: number;
    key: string;
  }>;
}

@Injectable()
export class PaymobService {
  private readonly logger = new Logger(PaymobService.name);
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly hmacSecret: string;
  private readonly baseUrl: string;
  private readonly cardIntegrationId: number;
  private readonly walletIntegrationId: number;
  private readonly fawryIntegrationId: number;
  private readonly callbackUrl: string;
  private readonly redirectUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('paymob.apiKey', '');
    this.secretKey = this.configService.get<string>('paymob.secretKey', '');
    this.hmacSecret = this.configService.get<string>('paymob.hmacSecret', '');
    this.baseUrl = this.configService.get<string>(
      'paymob.baseUrl',
      'https://accept.paymob.com',
    );
    this.cardIntegrationId = parseInt(
      this.configService.get<string>('paymob.cardIntegrationId', '0'),
      10,
    );
    this.walletIntegrationId = parseInt(
      this.configService.get<string>('paymob.walletIntegrationId', '0'),
      10,
    );
    this.fawryIntegrationId = parseInt(
      this.configService.get<string>('paymob.fawryIntegrationId', '0'),
      10,
    );
    this.callbackUrl = this.configService.get<string>('paymob.callbackUrl', '');
    this.redirectUrl = this.configService.get<string>('paymob.redirectUrl', '');
  }

  getPaymentMethodIds(): number[] {
    const ids: number[] = [];
    if (this.cardIntegrationId) ids.push(this.cardIntegrationId);
    if (this.walletIntegrationId) ids.push(this.walletIntegrationId);
    if (this.fawryIntegrationId) ids.push(this.fawryIntegrationId);
    return ids;
  }

  async createPaymentIntention(
    amountPiasters: number,
    currency: string,
    billingData: PaymobIntentionPayload['billingData'],
    extras: Record<string, string>,
  ): Promise<PaymobIntentionResponse> {
    const url = `${this.baseUrl}/v1/intention/`;

    const payload = {
      amount: amountPiasters,
      currency,
      payment_methods: this.getPaymentMethodIds(),
      items: [],
      billing_data: {
        first_name: billingData.first_name,
        last_name: billingData.last_name,
        email: billingData.email,
        phone_number: billingData.phone_number,
        apartment: 'NA',
        floor: 'NA',
        street: 'NA',
        building: 'NA',
        shipping_method: 'NA',
        postal_code: 'NA',
        city: 'NA',
        country: 'EG',
        state: 'NA',
      },
      extras,
      special_reference: extras.payment_id,
      notification_url: this.callbackUrl,
      redirection_url: this.redirectUrl,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            Authorization: `Token ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      return {
        intention_id: response.data.id || response.data.intention_id,
        client_secret: response.data.client_secret,
        payment_keys: response.data.payment_keys || [],
      };
    } catch (error) {
      this.logger.error(
        `Failed to create Paymob intention: ${error.response?.data?.message || error.message}`,
        error.response?.data,
      );
      throw error;
    }
  }

  verifyHmac(receivedHmac: string, data: Record<string, unknown>): boolean {
    // Paymob sends HMAC-SHA512 of concatenated values sorted alphabetically by key
    const sortedKeys = Object.keys(data).sort();
    const concatenated = sortedKeys.map((key) => data[key]).join('');

    const computed = crypto
      .createHmac('sha512', this.hmacSecret)
      .update(concatenated)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(receivedHmac, 'hex'),
    );
  }

  verifyTransactionHmac(
    hmac: string,
    transactionData: Record<string, unknown>,
  ): boolean {
    // Paymob transaction callback HMAC uses specific fields in specific order
    const hmacFields = [
      'amount_cents',
      'created_at',
      'currency',
      'error_occured',
      'has_parent_transaction',
      'id',
      'integration_id',
      'is_3d_secure',
      'is_auth',
      'is_capture',
      'is_refunded',
      'is_standalone_payment',
      'is_voided',
      'order.id',
      'owner',
      'pending',
      'source_data.pan',
      'source_data.sub_type',
      'source_data.type',
      'success',
    ];

    const concatenated = hmacFields
      .map((field) => {
        const parts = field.split('.');
        let value: unknown = transactionData;
        for (const part of parts) {
          value = (value as Record<string, unknown>)?.[part];
        }
        return String(value ?? '');
      })
      .join('');

    const computed = crypto
      .createHmac('sha512', this.hmacSecret)
      .update(concatenated)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed, 'hex'),
        Buffer.from(hmac, 'hex'),
      );
    } catch {
      return false;
    }
  }

  getCheckoutUrl(clientSecret: string): string {
    return `${this.baseUrl}/unifiedcheckout/?publicKey=${this.configService.get<string>('paymob.publicKey')}&clientSecret=${clientSecret}`;
  }
}
