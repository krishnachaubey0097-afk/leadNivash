import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.service.js';

export interface MailDeliveryResult {
  delivered: boolean;
  mode: 'smtp' | 'dev_preview';
}

class MailService {
  private transporter: Transporter | null = null;

  constructor() {
    if (env.SMTP_USER && env.SMTP_PASS) {
      const host = env.SMTP_HOST?.trim() || 'smtp.gmail.com';
      const port = Number(env.SMTP_PORT) || 465;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }
  }

  isSmtpConfigured(): boolean {
    return Boolean(this.transporter);
  }

  private getFromAddress(): string {
    return env.EMAIL_FROM || env.SMTP_FROM || (env.SMTP_USER ? `LeadNivash <${env.SMTP_USER}>` : 'LeadNivash <leadnivash@gmail.com>');
  }

  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    const baseUrl =
      env.CLIENT_URL && !env.CLIENT_URL.includes('localhost')
        ? env.CLIENT_URL
        : env.NODE_ENV === 'production'
        ? 'https://lead-nivash-frontend.vercel.app'
        : env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${baseUrl.replace(/\/+$/, '')}/reset-password?token=${resetToken}`;
    const subject = 'LeadNivash Password Reset Request';
    const text = `You requested a password reset for your LeadNivash account.\n\nClick the link below to set a new password:\n${resetUrl}\n\nThis link will expire in 30 minutes. If you did not request this, please ignore this email.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #12140F; margin-top: 0;">Reset Your LeadNivash Password</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.5;">
          We received a request to reset the password for your LeadNivash broker workspace.
        </p>
        <div style="margin: 24px 0;">
          <a href="${resetUrl}" style="background-color: #018E45; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px;">
          This link will expire in 30 minutes. If you did not request a password reset, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">LeadNivash · Real Estate Broker Operating System</p>
      </div>
    `;

    if (this.transporter && (env.NODE_ENV === 'production' || env.NODE_ENV === 'development')) {
      try {
        await this.transporter.sendMail({
          from: this.getFromAddress(),
          to,
          subject,
          text,
          html,
        });
        logger.info('Password reset email sent to recipient');
      } catch (err: any) {
        logger.error(`Failed to send password reset email: ${err.message}`);
      }
    } else {
      logger.info(`[MailService:Dev] Password reset requested for email. Reset URL: ${resetUrl}`);
    }
  }

  async sendVerificationOtp(
    to: string,
    otp: string,
    purpose: 'login' | 'register' | 'verify_email' = 'login'
  ): Promise<MailDeliveryResult> {
    const actionLabel =
      purpose === 'register'
        ? 'complete your LeadNivash registration'
        : 'sign in to your LeadNivash broker workspace';
    const subject = `Your LeadNivash Verification Code: ${otp}`;
    const text = `Your LeadNivash verification code is ${otp}. Enter this code to ${actionLabel}. It expires in 10 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff;">
        <div style="display: inline-block; padding: 4px 10px; border-radius: 999px; background: #E9FAEF; color: #018E45; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">
          LeadNivash Verification
        </div>
        <h2 style="color: #12140F; margin: 12px 0 8px; font-size: 20px;">Verify Your Email Address</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0;">
          Use the 6-digit verification code below to ${actionLabel}:
        </p>
        <div style="margin: 22px 0; padding: 18px; background: #F7F9F8; border: 1px solid #D5E2DA; border-radius: 12px; text-align: center;">
          <span style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #018E45; font-family: monospace;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
          This code expires in <strong>10 minutes</strong>. Never share this OTP with anyone. If you did not request it, you can ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px; margin: 0;">LeadNivash · India's Real Estate Broker Operating System</p>
      </div>
    `;

    if (this.transporter && env.NODE_ENV !== 'test') {
      try {
        await this.transporter.sendMail({
          from: this.getFromAddress(),
          to,
          subject,
          text,
          html,
        });
        logger.info('Verification OTP email sent via SMTP');
        return { delivered: true, mode: 'smtp' };
      } catch (err: any) {
        logger.error(`Failed to send verification OTP email: ${err.message}`);
        if (env.NODE_ENV === 'production') {
          const mailErr: any = new Error(
            'Could not deliver OTP email right now. Please verify email address or SMTP configuration.'
          );
          mailErr.statusCode = 503;
          mailErr.code = 'MAIL_DELIVERY_FAILED';
          throw mailErr;
        }
      }
    }

    if (env.NODE_ENV === 'production') {
      const cfgErr: any = new Error(
        'Email OTP delivery is not configured on the server yet. Please configure SMTP_USER and SMTP_PASS.'
      );
      cfgErr.statusCode = 503;
      cfgErr.code = 'EMAIL_NOT_CONFIGURED';
      throw cfgErr;
    }

    logger.info(`[MailService:Dev] Verification OTP (${purpose}) for ${to}: ${otp}`);
    return { delivered: false, mode: 'dev_preview' };
  }
}

export const mailService = new MailService();
