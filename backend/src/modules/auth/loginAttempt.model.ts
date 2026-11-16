import mongoose, { Schema, type Document } from 'mongoose';
import crypto from 'crypto';

export interface ILoginAttempt extends Document {
  identifier: string; // hash of email+ip or email-only
  count: number;
  lockedUntil?: Date;
  updatedAt: Date;
}

const LoginAttemptSchema = new Schema<ILoginAttempt>(
  {
    identifier: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    count: {
      type: Number,
      required: true,
      default: 1,
    },
    lockedUntil: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-expire lock records 2 hours after last update
LoginAttemptSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7200 });

export const LoginAttempt = mongoose.model<ILoginAttempt>('LoginAttempt', LoginAttemptSchema);

export function hashIdentifier(email: string, ip: string): string {
  return crypto.createHash('sha256').update(`pair:${email.toLowerCase().trim()}:${ip}`).digest('hex');
}

export function hashEmailOnly(email: string): string {
  return crypto.createHash('sha256').update(`email:${email.toLowerCase().trim()}`).digest('hex');
}
