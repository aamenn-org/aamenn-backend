import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  RawBodyRequest,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { PaymentsService } from './payments.service';
import { PaymobService } from './paymob.service';
import { InstapayService } from './instapay.service';
import { InitiateCheckoutDto } from './dto/initiate-checkout.dto';
import { SubmitInstapayDto } from './dto/submit-instapay.dto';
import { User } from '../../database/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paymobService: PaymobService,
    private readonly instapayService: InstapayService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // ─── Plans ──────────────────────────────────────────────────────────

  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'List available storage plans' })
  @ApiResponse({ status: 200, description: 'List of active plans' })
  async getPlans() {
    const plans = await this.paymentsService.getActivePlans();
    return { plans };
  }

  // ─── Subscription ──────────────────────────────────────────────────

  @Get('subscription')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current subscription' })
  @ApiResponse({ status: 200, description: 'Current subscription or null' })
  async getSubscription(@CurrentUser() authUser: AuthenticatedUser) {
    const subscription = await this.paymentsService.getUserSubscription(
      authUser.userId,
    );
    return { subscription };
  }

  @Get('subscription/history')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get subscription history' })
  async getSubscriptionHistory(@CurrentUser() authUser: AuthenticatedUser) {
    const subscriptions = await this.paymentsService.getUserSubscriptionHistory(
      authUser.userId,
    );
    return { subscriptions };
  }

  // ─── Checkout ──────────────────────────────────────────────────────

  @Post('checkout')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate payment checkout for a plan' })
  @ApiResponse({ status: 200, description: 'Checkout URL and payment ID' })
  async initiateCheckout(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() dto: InitiateCheckoutDto,
  ) {
    const user = await this.userRepo.findOne({
      where: { id: authUser.userId },
    });
    if (!user) throw new BadRequestException('User not found');

    const result = await this.paymentsService.initiateCheckout(
      user,
      dto.planId,
    );
    return result;
  }

  @Post('renew')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renew current subscription' })
  @ApiResponse({ status: 200, description: 'Checkout URL for renewal' })
  async renewSubscription(@CurrentUser() authUser: AuthenticatedUser) {
    const user = await this.userRepo.findOne({
      where: { id: authUser.userId },
    });
    if (!user) throw new BadRequestException('User not found');

    const result = await this.paymentsService.initiateRenewal(user);
    return result;
  }

  // ─── Payment History ───────────────────────────────────────────────

  @Get('history')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get payment history' })
  async getPaymentHistory(@CurrentUser() authUser: AuthenticatedUser) {
    const payments = await this.paymentsService.getUserPayments(
      authUser.userId,
    );
    return { payments };
  }

  // ─── InstaPay (manual transfer flow) ──────────────────────────────

  @Get('instapay/info')
  @Public()
  @ApiOperation({
    summary:
      'Get public InstaPay configuration (username, QR data URL, enabled)',
  })
  async getInstapayInfo() {
    return this.instapayService.getInfo();
  }

  @Get('instapay/status')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      "Get the user's most recent InstaPay submission (pending or last reviewed)",
  })
  async getInstapayStatus(@CurrentUser() authUser: AuthenticatedUser) {
    const submission = await this.instapayService.getUserLatestSubmission(
      authUser.userId,
    );
    if (!submission) {
      return { submission: null };
    }
    // Strip the internal B2 path from the user-facing response.
    const { screenshotB2Path: _omit, ...safe } = submission;
    return { submission: safe };
  }

  @Post('instapay/submit')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('screenshot', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['screenshot', 'planId', 'instapayReference'],
      properties: {
        screenshot: { type: 'string', format: 'binary' },
        planId: { type: 'string', format: 'uuid' },
        instapayReference: { type: 'string' },
        senderName: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Submit InstaPay transfer proof for verification' })
  async submitInstapay(
    @CurrentUser() authUser: AuthenticatedUser,
    @UploadedFile()
    file: {
      buffer: Buffer;
      size: number;
      mimetype: string;
      originalname: string;
    },
    @Body() dto: SubmitInstapayDto,
  ) {
    const submission = await this.instapayService.submitPayment(
      authUser.userId,
      dto.planId,
      file,
      dto.instapayReference,
      dto.senderName,
    );
    return {
      id: submission.id,
      status: submission.status,
      createdAt: submission.createdAt,
    };
  }

  // ─── Paymob Webhook (server-to-server) ─────────────────────────────

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paymob webhook callback' })
  async handleWebhook(
    @Query('hmac') hmac: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!hmac) {
      this.logger.warn('Webhook received without HMAC');
      throw new BadRequestException('Missing HMAC');
    }

    // Extract transaction object — Paymob sends it in body.obj
    const transactionData = (body.obj || body) as Record<string, unknown>;

    // Verify HMAC signature
    const isValid = this.paymobService.verifyTransactionHmac(
      hmac,
      transactionData,
    );
    if (!isValid) {
      this.logger.warn('Webhook HMAC verification failed');
      throw new BadRequestException('Invalid HMAC signature');
    }

    await this.paymentsService.processWebhook(transactionData);

    return { status: 'ok' };
  }

  // ─── Paymob Redirect Callback (browser redirect) ──────────────────

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Paymob redirect callback after payment' })
  async handleCallback(@Query() query: Record<string, string>) {
    // This endpoint is hit when the user is redirected back from Paymob
    // The actual payment processing is done via the webhook
    // This just returns the payment status for the frontend to display
    const success = query['success'] === 'true';
    const transactionId = query['id'] || query['transaction_id'];
    const orderId = query['order'];

    return {
      success,
      transactionId,
      orderId,
      message: success ? 'Payment successful' : 'Payment failed or cancelled',
    };
  }
}
