import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ILocalityAlias extends Document {
  userId?: Types.ObjectId | null;
  city: string;
  canonical: string;
  canonicalKey: string;
  aliases: string[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LocalityAliasSchema = new Schema<ILocalityAlias>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    city: {
      type: String,
      required: true,
      default: 'Panipat',
      trim: true,
    },
    canonical: {
      type: String,
      required: true,
      trim: true,
    },
    canonicalKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    aliases: {
      type: [String],
      required: true,
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

LocalityAliasSchema.index({ city: 1, canonicalKey: 1 });
LocalityAliasSchema.index({ userId: 1, city: 1 });

export const LocalityAlias = mongoose.model<ILocalityAlias>('LocalityAlias', LocalityAliasSchema);
