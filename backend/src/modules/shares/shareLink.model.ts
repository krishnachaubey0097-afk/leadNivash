import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IShareLink extends Document {
  userId: Types.ObjectId;
  propertyId: Types.ObjectId;
  token: string;
  expiresAt: Date;
  revokedAt?: Date;
  isRevoked: boolean;
  viewCount: number;
  lastViewedAt?: Date;
  template?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ShareLinkSchema = new Schema<IShareLink>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    lastViewedAt: {
      type: Date,
    },
    template: {
      type: String,
      default: 'flyer',
    },
  },
  {
    timestamps: true,
  }
);

ShareLinkSchema.index({ token: 1, isRevoked: 1 });
ShareLinkSchema.index({ propertyId: 1, userId: 1 });

export const ShareLink = mongoose.model<IShareLink>('ShareLink', ShareLinkSchema);

