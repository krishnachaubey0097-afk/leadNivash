import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { getPlanLimits } from '../../config/plans.js';

export type AuthProviderType = 'password' | 'google' | 'email_otp';

export interface ISession {
  sessionId: string;
  refreshTokenHash: string;
  previousTokenHash?: string;
  previousHashExpiresAt?: Date;
  deviceLabel?: string;
  authMethod?: AuthProviderType;
  ip?: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  phone: string;
  role: 'user' | 'admin';
  googleId?: string;
  emailVerified: boolean;
  hasPassword: boolean;
  authProviders: AuthProviderType[];
  lastLoginAt?: Date;
  lastLoginMethod?: AuthProviderType;
  agency: {
    name: string;
    city: string;
    logoUrl?: string;
    reraNo?: string;
  };
  preferences: {
    language: 'en' | 'hi' | 'pa' | 'ta' | 'mr';
    budgetTolerancePct: number;
    marlaToGaj: number;
    defaultCity: string;
    defaultState: string;
  };
  plan: {
    tier: 'trial' | 'lite' | 'pro';
    trialEndsAt: Date;
    expiresAt?: Date;
    limits: {
      maxListings: number;
      maxBuyers: number;
      maxParsesMonthly: number;
      maxPhotosPerListing: number;
      flyerBranding: boolean;
      supportLevel: string;
    };
  };
  consent: {
    termsAcceptedAt: Date;
    privacyVersion: string;
  };
  sessions: ISession[];
  pushSubscriptions?: any[];
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  isDisabled: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    sessionId: { type: String, required: true },
    refreshTokenHash: { type: String, required: true },
    previousTokenHash: { type: String },
    previousHashExpiresAt: { type: Date },
    deviceLabel: { type: String, default: 'Web Browser' },
    authMethod: { type: String, enum: ['password', 'google', 'email_otp'], default: 'password' },
    ip: { type: String },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Never returned by default queries
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    googleId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    hasPassword: {
      type: Boolean,
      default: true,
    },
    authProviders: {
      type: [String],
      enum: ['password', 'google', 'email_otp'],
      default: ['password'],
    },
    lastLoginAt: {
      type: Date,
    },
    lastLoginMethod: {
      type: String,
      enum: ['password', 'google', 'email_otp'],
    },
    agency: {
      name: { type: String, default: '' },
      city: { type: String, default: 'Panipat' },
      logoUrl: { type: String },
      reraNo: { type: String },
    },
    preferences: {
      language: { type: String, enum: ['en', 'hi', 'pa', 'ta', 'mr'], default: 'en' },
      budgetTolerancePct: { type: Number, default: 10, min: 0, max: 50 },
      marlaToGaj: { type: Number, default: 30.25 },
      defaultCity: { type: String, default: 'Panipat' },
      defaultState: { type: String, default: 'Haryana', trim: true },
    },
    plan: {
      tier: { type: String, enum: ['trial', 'lite', 'pro'], default: 'trial' },
      trialEndsAt: {
        type: Date,
        default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
      expiresAt: { type: Date },
      limits: {
        type: Schema.Types.Mixed,
        default: () => getPlanLimits('trial'),
      },
    },
    consent: {
      termsAcceptedAt: { type: Date, required: true, default: Date.now },
      privacyVersion: { type: String, required: true, default: '1.0' },
    },
    sessions: [SessionSchema],
    pushSubscriptions: { type: [Schema.Types.Mixed], default: [] },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date },
    isDisabled: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        delete ret.passwordHash;
        delete ret.passwordResetTokenHash;
        delete ret.__v;
        if (Array.isArray(ret.sessions)) {
          for (const s of ret.sessions) {
            delete s.refreshTokenHash;
            delete s.previousTokenHash;
            delete s.previousHashExpiresAt;
          }
        }
        return ret;
      },
    },
    toObject: {
      transform: (_doc, ret: any) => {
        delete ret.passwordHash;
        delete ret.passwordResetTokenHash;
        delete ret.__v;
        if (Array.isArray(ret.sessions)) {
          for (const s of ret.sessions) {
            delete s.refreshTokenHash;
            delete s.previousTokenHash;
            delete s.previousHashExpiresAt;
          }
        }
        return ret;
      },
    },
  }
);

UserSchema.index({ phone: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
