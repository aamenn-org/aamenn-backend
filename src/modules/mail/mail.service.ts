import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { welcomeEmailTemplate } from './templates/welcome.template';
import { otpEmailTemplate } from './templates/otp.template';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null;
  private readonly emailFrom: string;

  constructor(private configService: ConfigService) {
    this.emailFrom = this.configService.get<string>(
      'mail.from',
      'noreply@aamenn.com',
    );
  }

  async onModuleInit() {
    // Initialize SMTP transporter
    const host = this.configService.get<string>('mail.host');
    const user = this.configService.get<string>('mail.user');
    const pass = this.configService.get<string>('mail.pass');
    const port = this.configService.get<number>('mail.port', 587);

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      // Test the connection
      try {
        await this.transporter.verify();
        this.logger.log('✅ SMTP transporter initialized and verified');
      } catch (error) {
        this.logger.error('❌ SMTP connection failed:', error.message);
        this.logger.warn('Falling back to console logging for OTP');
        this.transporter = null;
      }
    } else {
      this.logger.warn(
        '❌ SMTP not configured — emails will be logged to console',
      );
      this.logger.warn(
        `Missing: ${!host ? 'host ' : ''}${!user ? 'user ' : ''}${!pass ? 'pass ' : ''}`,
      );
    }
  }

  /**
   * Send OTP email for vault reset.
   */
  async sendOtpEmail(
    email: string,
    otp: string,
    ttlMinutes: number,
  ): Promise<void> {
    const html = otpEmailTemplate(otp, ttlMinutes);

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.emailFrom,
          to: email,
          subject: 'Aamenn — Vault Password Reset Code',
          html,
        });
        this.logger.log(`OTP email sent to: ${email}`);
      } catch (error) {
        this.logger.error('Email sending failed:', error.message);
        // Fallback to console
        this.logger.warn(`[FALLBACK] OTP for ${email}: ${otp}`);
      }
    } else {
      // Fallback: log to console in development
      this.logger.warn(`[FALLBACK] OTP for ${email}: ${otp}`);
    }
  }

  /**
   * Send welcome email to new users.
   */
  async sendWelcomeEmail(email: string, userName: string): Promise<void> {
    const html = welcomeEmailTemplate(userName);

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.emailFrom,
          to: email,
          subject: 'Welcome to Aamenn! 🎉',
          html,
        });
      } catch (error) {
        this.logger.error('Welcome email sending failed:', error.message);
        // Don't throw - welcome email failure shouldn't break registration
      }
    } else {
      // Fallback: log to console in development
      this.logger.warn(`[FALLBACK] Welcome email for ${email} (${userName})`);
    }
  }

  /**
   * Send a generic email with custom subject and HTML body.
   */
  async sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.emailFrom,
          to: options.to,
          subject: options.subject,
          html: options.html,
        });
        this.logger.log(`Email sent to: ${options.to} — ${options.subject}`);
      } catch (error) {
        this.logger.error(
          `Email sending failed to ${options.to}: ${error.message}`,
        );
      }
    } else {
      this.logger.warn(`[FALLBACK] Email to ${options.to}: ${options.subject}`);
    }
  }
}
