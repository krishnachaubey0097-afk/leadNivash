import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ILeadSubmission extends Document {
  _id: Types.ObjectId;
  brokerId: Types.ObjectId;
  category: 'buyer' | 'seller';
  buyerId?: Types.ObjectId;
  propertyId?: Types.ObjectId;
  name: string;
  phoneE164: string;
  email?: string;
  purpose: 'Sale' | 'Rent';
  budgetPaise: number;
  isApproxBudget: boolean;
  localitySummary?: string;
  requirementSummary: string;
  notes?: string;
  ipHash: string;
  status: 'new' | 'contacted' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

const LeadSubmissionSchema = new Schema<ILeadSubmission>(
  {
    brokerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['buyer', 'seller'],
      required: true,
      index: true,
    },
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: 'Buyer',
    },
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phoneE164: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    purpose: {
      type: String,
      enum: ['Sale', 'Rent'],
      default: 'Sale',
    },
    budgetPaise: {
      type: Number,
      required: true,
      min: 10000,
    },
    isApproxBudget: {
      type: Boolean,
      default: true,
    },
    localitySummary: {
      type: String,
      trim: true,
    },
    requirementSummary: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    ipHash: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'archived'],
      default: 'new',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

LeadSubmissionSchema.index({ brokerId: 1, createdAt: -1 });

export const LeadSubmission = mongoose.model<ILeadSubmission>('LeadSubmission', LeadSubmissionSchema);
