import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type PlanCode = 'monthly_399' | 'yearly_trial_3299' | 'yearly_3999';
export type PaymentFlowMode = 'autopay' | 'one_time';
export type PaymentRecordStatus =
  | 'INITIATED'
  | 'BANK_APPROVAL_PENDING'
  | 'ACTIVE'
  | 'PAID'
  | 'ON_HOLD'
  | 'CANCELLED'
  | 'FAILED'
  | 'EXPIRED';

export interface IWebhookEventLog {
  eventType: string;
  receivedAt: Date;
  status?: string;
}

export interface IPaymentRecord extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  planCode: PlanCode;
  planTier: 'lite' | 'pro';
  mode: PaymentFlowMode;
  amountINR: number;
  currency: string;
  cashfreeId: string; // subscription_id (sub_...) or order_id (ord_...)
  cfReferenceId?: string; // Cashfree internal cf_subscription_id / cf_order_id
  sessionId?: string;
  status: PaymentRecordStatus;
  autopayEnabled: boolean;
  periodStart?: Date;
  periodEnd?: Date;
  nextBillingAt?: Date;
  lastPaymentId?: string;
  failureReason?: string;
  webhookEvents: IWebhookEventLog[];
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEventLogSchema = new Schema<IWebhookEventLog>(
  {
    eventType: { type: String, required: true },
    receivedAt: { type: Date, default: Date.now },
    status: { type: String },
  },
  { _id: false }
);

const PaymentRecordSchema = new Schema<IPaymentRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    planCode: {
      type: String,
      enum: ['monthly_399', 'yearly_trial_3299', 'yearly_3999'],
      required: true,
    },
    planTier: {
      type: String,
      enum: ['lite', 'pro'],
      required: true,
    },
    mode: {
      type: String,
      enum: ['autopay', 'one_time'],
      default: 'autopay',
    },
    amountINR: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    cashfreeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    cfReferenceId: {
      type: String,
    },
    sessionId: {
      type: String,
    },
    status: {
      type: String,
      enum: [
        'INITIATED',
        'BANK_APPROVAL_PENDING',
        'ACTIVE',
        'PAID',
        'ON_HOLD',
        'CANCELLED',
        'FAILED',
        'EXPIRED',
      ],
      default: 'INITIATED',
      index: true,
    },
    autopayEnabled: {
      type: Boolean,
      default: false,
    },
    periodStart: { type: Date },
    periodEnd: { type: Date },
    nextBillingAt: { type: Date },
    lastPaymentId: { type: String },
    failureReason: { type: String },
    webhookEvents: {
      type: [WebhookEventLogSchema],
      default: [],
    },
  },
  { timestamps: true }
);

PaymentRecordSchema.index({ userId: 1, createdAt: -1 });

export const PaymentRecord = mongoose.model<IPaymentRecord>('PaymentRecord', PaymentRecordSchema);
