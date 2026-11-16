import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type DealStage = 'interested' | 'shown' | 'negotiating' | 'finalized' | 'paid' | 'lost';
export type CommissionMode = 'percent' | 'flat';

export interface IDealPayment {
  amountPaise: number;
  receivedAt: Date;
  note?: string;
}

export interface IDealStageHistory {
  stage: DealStage;
  at: Date;
}

export interface IDeal extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  buyerId: Types.ObjectId;
  propertyId?: Types.ObjectId;
  propertyTitleSnapshot: string;
  valuePaise: number;
  commission: {
    mode: CommissionMode;
    bps?: number; // Basis points (100 = 1%)
    flatPaise?: number;
    expectedPaise: number; // Server-computed
  };
  payments: IDealPayment[];
  stage: DealStage;
  stageHistory: IDealStageHistory[];
  lostReason?: string;
  nextFollowUpAt?: Date;
  notes?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DealPaymentSchema = new Schema<IDealPayment>(
  {
    amountPaise: { type: Number, required: true, min: 1 },
    receivedAt: { type: Date, default: Date.now },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const DealStageHistorySchema = new Schema<IDealStageHistory>(
  {
    stage: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DealSchema = new Schema<IDeal>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: 'Buyer',
      required: true,
      index: true,
    },
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
    },
    propertyTitleSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    valuePaise: {
      type: Number,
      required: true,
      min: 10000,
    },
    commission: {
      mode: {
        type: String,
        enum: ['percent', 'flat'],
        required: true,
      },
      bps: {
        type: Number,
        min: 1,
        max: 10000, // Max 100%
      },
      flatPaise: {
        type: Number,
        min: 1,
      },
      expectedPaise: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    payments: [DealPaymentSchema],
    stage: {
      type: String,
      enum: ['interested', 'shown', 'negotiating', 'finalized', 'paid', 'lost'],
      default: 'interested',
      index: true,
    },
    stageHistory: [DealStageHistorySchema],
    lostReason: {
      type: String,
      trim: true,
    },
    nextFollowUpAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

DealSchema.index({ userId: 1, stage: 1 });

export const Deal = mongoose.model<IDeal>('Deal', DealSchema);

