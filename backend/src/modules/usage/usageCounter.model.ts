import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IUsageCounter extends Document {
  userId: Types.ObjectId;
  period: string; // "YYYY-MM"
  parses: number;
  shares: number;
  createdAt: Date;
  updatedAt: Date;
}

const UsageCounterSchema = new Schema<IUsageCounter>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    period: {
      type: String,
      required: true, // e.g. "2026-11"
    },
    parses: {
      type: Number,
      default: 0,
    },
    shares: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

UsageCounterSchema.index({ userId: 1, period: 1 }, { unique: true });

export const UsageCounter = mongoose.model<IUsageCounter>('UsageCounter', UsageCounterSchema);

export function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

