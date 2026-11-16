import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IInquiry extends Document {
  propertyId: Types.ObjectId;
  shareLinkId?: Types.ObjectId;
  name: string;
  phoneE164: string;
  message?: string;
  ipHash: string;
  status: 'new' | 'contacted' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

const InquirySchema = new Schema<IInquiry>(
  {
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true,
    },
    shareLinkId: {
      type: Schema.Types.ObjectId,
      ref: 'ShareLink',
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
    },
    message: {
      type: String,
      trim: true,
      maxlength: 1000,
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

InquirySchema.index({ propertyId: 1, createdAt: -1 });

export const Inquiry = mongoose.model<IInquiry>('Inquiry', InquirySchema);

