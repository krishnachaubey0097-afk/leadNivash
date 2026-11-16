import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IBuyerLocality {
  display: string;
  key: string;
}

export interface IBuyer extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  phoneE164: string;
  localities: IBuyerLocality[];
  anyLocality: boolean; // Must be explicitly true to match any locality
  types: string[]; // ['Plot', 'Kothi', etc.]
  purpose: 'Sale' | 'Rent';
  budget: {
    minPaise?: number;
    maxPaise: number;
  };
  sizeGaj?: {
    min?: number;
    max?: number;
  };
  urgency: 'hot' | 'warm' | 'cold';
  status: 'active' | 'paused' | 'closed';
  notes?: string;
  rawText?: string;
  lastContactedAt?: Date;
  source: 'manual' | 'paste';
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BuyerLocalitySchema = new Schema<IBuyerLocality>(
  {
    display: { type: String, required: true },
    key: { type: String, required: true, lowercase: true, trim: true },
  },
  { _id: false }
);

const BuyerSchema = new Schema<IBuyer>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
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
      index: true,
    },
    localities: [BuyerLocalitySchema],
    anyLocality: {
      type: Boolean,
      default: false,
    },
    types: [{ type: String, trim: true }],
    purpose: {
      type: String,
      enum: ['Sale', 'Rent'],
      default: 'Sale',
    },
    budget: {
      minPaise: { type: Number, min: 0 },
      maxPaise: { type: Number, required: true, min: 10000 },
    },
    sizeGaj: {
      min: { type: Number, min: 0 },
      max: { type: Number },
    },
    urgency: {
      type: String,
      enum: ['hot', 'warm', 'cold'],
      default: 'warm',
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'closed'],
      default: 'active',
      index: true,
    },
    notes: { type: String, trim: true },
    rawText: { type: String },
    lastContactedAt: { type: Date },
    source: {
      type: String,
      enum: ['manual', 'paste'],
      default: 'manual',
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying active buyers per user
BuyerSchema.index({ userId: 1, status: 1, 'budget.maxPaise': 1 });

export const Buyer = mongoose.model<IBuyer>('Buyer', BuyerSchema);

