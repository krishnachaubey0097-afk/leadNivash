import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.service.js';

class MailService {
  private transporter: Transporter | null = null;

  constructor() {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT) || 587,
        secure: Number(env.SMTP_PORT) === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }
  }

  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    const resetUrl = `${env.CLIENT_URL}/reset-password?token=${resetToken}`;
    const subject = 'LeadNivesh Password Reset Request';
    const text = `You requested a password reset for your LeadNivesh account.\n\nClick the link below to set a new password:\n${resetUrl}\n\nThis link will expire in 30 minutes. If you did not request this, please ignore this email.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">Reset Your Password</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.5;">
          We received a request to reset your password for your LeadNivesh account.
        </p>
        <div style="margin: 24px 0;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px;">
          This link will expire in 30 minutes. If you did not request a password reset, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">LeadNivesh Property & Deal CRM</p>
      </div>
    `;

    if (this.transporter && env.NODE_ENV === 'production') {
      try {
        await this.transporter.sendMail({
          from: env.SMTP_FROM,
          to,
          subject,
          text,
          html,
        });
        logger.info(`Password reset email sent to recipient`);
      } catch (err: any) {
        logger.error(`Failed to send password reset email: ${err.message}`);
        // Do not throw to avoid revealing failure details externally
      }
    } else {
      // Dev / Test fallback: Log the reset token securely
      logger.info(`[MailService:Dev] Password reset requested for email. Reset URL: ${resetUrl}`);
    }
  }

  async sendVerificationOtp(to: string, otp: string): Promise<void> {
    const subject = `Your leadNivash Verification Code: ${otp}`;
    const text = `Your leadNivash verification code is ${otp}. This code expires in 10 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Verify Your Work Email</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.5;">
          Use the 6-digit verification code below to confirm your email and proceed with your leadNivash account registration:
        </p>
        <div style="margin: 24px 0; padding: 16px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; text-align: center;">
          <span style="font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #047857; font-family: monospace;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 12px;">
          This code is valid for 10 minutes. If you did not request this verification, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px;">leadNivash Broker Operating System</p>
      </div>
    `;

    if (this.transporter && env.NODE_ENV === 'production') {
      try {
        await this.transporter.sendMail({
          from: env.SMTP_FROM,
          to,
          subject,
          text,
          html,
        });
        logger.info(`Verification OTP email sent to recipient`);
      } catch (err: any) {
        logger.error(`Failed to send verification OTP email: ${err.message}`);
      }
    } else {
      logger.info(`[MailService:Dev] Verification OTP for ${to}: ${otp}`);
    }
  }
}

export const mailService = new MailService();
