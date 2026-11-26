import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type AuthMethod = 'password' | 'google' | 'email_otp';
export type AuthLogAction = 'register' | 'login' | 'link_provider';

export interface IAuthLoginLog extends Document {
  userId: Types.ObjectId;
  email: string;
  method: AuthMethod;
  action: AuthLogAction;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
  createdAt: Date;
}

const AuthLoginLogSchema = new Schema<IAuthLoginLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    method: {
      type: String,
      enum: ['password', 'google', 'email_otp'],
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ['register', 'login', 'link_provider'],
      default: 'login',
    },
    ip: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    sessionId: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

// Automatically retain 180 days of auth login history in MongoDB
AuthLoginLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
AuthLoginLogSchema.index({ userId: 1, createdAt: -1 });

export const AuthLoginLog = mongoose.model<IAuthLoginLog>('AuthLoginLog', AuthLoginLogSchema);
