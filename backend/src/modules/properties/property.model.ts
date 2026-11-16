import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type PropertyType = 'Plot' | 'Kothi' | 'Floor' | 'Flat' | 'Shop' | 'Other';
export type PropertyCategory = 'Residential' | 'Commercial';
export type PropertyPurpose = 'Sale' | 'Rent';
export type PropertyStatus = 'available' | 'hold' | 'sold' | 'rented';

export interface IPropertyPhoto {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
}

export interface IOwnerVault {
  name?: string;
  phone?: string;
  notes?: string;
}

export interface IProperty extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  type: PropertyType;
  category: PropertyCategory;
  purpose: PropertyPurpose;
  locality: string;
  localityKey: string;
  city: string;
  landmark?: string;
  size: {
    value: number;
    unit: string;
  };
  sizeGaj: number; // Canonical size in Gaj
  priceDemandPaise: number; // In integer paise
  facing?: string;
  tags: string[];
  description?: string;
  status: PropertyStatus;
  photos: IPropertyPhoto[];
  owner?: IOwnerVault; // Protected Owner Vault
  source: 'manual' | 'paste';
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PhotoSchema = new Schema<IPropertyPhoto>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: { type: Number },
    height: { type: Number },
  },
  { _id: false }
);

const OwnerVaultSchema = new Schema<IOwnerVault>(
  {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { _id: false }
);

const PropertySchema = new Schema<IProperty>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['Plot', 'Kothi', 'Floor', 'Flat', 'Shop', 'Other'],
      required: true,
    },
    category: {
      type: String,
      enum: ['Residential', 'Commercial'],
      default: 'Residential',
    },
    purpose: {
      type: String,
      enum: ['Sale', 'Rent'],
      default: 'Sale',
    },
    locality: {
      type: String,
      required: true,
      trim: true,
    },
    localityKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    city: {
      type: String,
      required: true,
      default: 'Panipat',
      trim: true,
    },
    landmark: {
      type: String,
      trim: true,
    },
    size: {
      value: { type: Number, required: true, min: 0.1 },
      unit: { type: String, required: true, default: 'gaj' },
    },
    sizeGaj: {
      type: Number,
      required: true,
      min: 0.1,
      index: true,
    },
    priceDemandPaise: {
      type: Number,
      required: true,
      min: 10000, // Min ₹100
      max: 1000000000000, // Max ₹10,000 Crore
      index: true,
    },
    facing: {
      type: String,
      trim: true,
    },
    tags: [{ type: String, trim: true }],
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['available', 'hold', 'sold', 'rented'],
      default: 'available',
      index: true,
    },
    photos: {
      type: [PhotoSchema],
      validate: [(val: IPropertyPhoto[]) => val.length <= 4, 'Maximum of 4 photos allowed'],
      default: [],
    },
    owner: {
      type: OwnerVaultSchema,
      select: false, // ⚠️ CRITICAL: Owner Vault is never selected in regular queries
    },
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
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound queries for matching and fast filter retrieval
PropertySchema.index({ userId: 1, status: 1, localityKey: 1 });
PropertySchema.index({ userId: 1, priceDemandPaise: 1 });
PropertySchema.index({ userId: 1, sizeGaj: 1 });
// Text search on title and locality ONLY (strictly excludes owner data)
PropertySchema.index({ title: 'text', locality: 'text' });

export const Property = mongoose.model<IProperty>('Property', PropertySchema);

