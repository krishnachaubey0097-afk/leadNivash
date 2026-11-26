import mongoose, { Schema, type Document } from 'mongoose';

export type OtpPurpose = 'login' | 'register' | 'verify_email';

export interface IEmailOtp extends Document {
  email: string;
  otpHash: string;
  purpose: OtpPurpose;
  attempts: number;
  expiresAt: Date;
  verifiedAt?: Date;
  verificationTokenHash?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailOtpSchema = new Schema<IEmailOtp>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ['login', 'register', 'verify_email'],
      default: 'login',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    verifiedAt: {
      type: Date,
    },
    verificationTokenHash: {
      type: String,
      index: true,
    },
    ip: {
      type: String,
    },
  },
  { timestamps: true }
);

// Compound lookup + automatic MongoDB TTL purge upon expiry
EmailOtpSchema.index({ email: 1, purpose: 1 });
EmailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailOtp = mongoose.model<IEmailOtp>('EmailOtp', EmailOtpSchema);
