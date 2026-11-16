import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type ActivityEventType =
  | 'property_created'
  | 'property_updated'
  | 'property_status_changed'
  | 'buyer_created'
  | 'buyer_updated'
  | 'share_initiated'
  | 'deal_created'
  | 'deal_stage_changed'
  | 'deal_payment_recorded'
  | 'parse_executed'
  | 'admin_plan_changed'
  | 'inquiry_received';

export interface IActivityLog extends Document {
  userId: Types.ObjectId;
  type: ActivityEventType;
  entityType?: 'property' | 'buyer' | 'deal' | 'share' | 'user' | 'inquiry';
  entityId?: Types.ObjectId;
  meta?: Record<string, unknown>; // NO PII (no phone, owner name, or raw pasted text)
  createdAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: ['property', 'buyer', 'deal', 'share', 'user'],
    },
    entityId: {
      type: Schema.Types.ObjectId,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// TTL Index: Auto-purge logs older than 180 days (15,552,000 seconds)
ActivityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const ActivityLog = mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);

