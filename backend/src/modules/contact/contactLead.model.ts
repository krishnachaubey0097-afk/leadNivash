import mongoose, { Schema, type Document } from 'mongoose';

export interface IContactLead extends Document {
  name: string;
  email?: string;
  phone: string;
  phoneE164: string;
  message: string;
  city?: string;
  agencyName?: string;
  ipHash: string;
  createdAt: Date;
}

const ContactLeadSchema = new Schema<IContactLead>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    phone: {
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
      required: true,
      trim: true,
      maxlength: 2000,
    },
    city: {
      type: String,
      trim: true,
      default: 'Panipat',
      maxlength: 50,
    },
    agencyName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    ipHash: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const ContactLead = mongoose.model<IContactLead>('ContactLead', ContactLeadSchema);

