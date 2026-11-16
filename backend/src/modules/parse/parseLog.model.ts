import mongoose, { Schema, type Types } from 'mongoose';

export interface IParseLog {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  inputChars: number;
  itemsCount: number;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  costEstimate?: number;
  latencyMs: number;
  ok: boolean;
  errorCode?: string;
  createdAt: Date;
}

const ParseLogSchema = new Schema<IParseLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    inputChars: {
      type: Number,
      required: true,
    },
    itemsCount: {
      type: Number,
      required: true,
      default: 1,
    },
    model: {
      type: String,
      required: true,
    },
    tokensIn: {
      type: Number,
      default: 0,
    },
    tokensOut: {
      type: Number,
      default: 0,
    },
    costEstimate: {
      type: Number,
      default: 0,
    },
    latencyMs: {
      type: Number,
      required: true,
    },
    ok: {
      type: Boolean,
      required: true,
      default: true,
    },
    errorCode: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      // 90-day TTL index (7776000 seconds)
      expires: 90 * 24 * 60 * 60,
    },
  },
  {
    timestamps: false,
  }
);

ParseLogSchema.index({ userId: 1, createdAt: -1 });

export const ParseLog = mongoose.model<IParseLog>('ParseLog', ParseLogSchema);
