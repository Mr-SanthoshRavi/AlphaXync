import { Schema, model, Document } from 'mongoose';

export type OtpPurpose = 'INITIAL_SETUP' | 'STAFF_FIRST_LOGIN' | 'LOGIN_OTP';

export interface IVerificationOtp extends Document {
  email: string;
  otp: string;
  purpose: OtpPurpose;
  metadata?: Record<string, any>;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const VerificationOtpSchema = new Schema<IVerificationOtp>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otp: { type: String, required: true, trim: true },
    purpose: { 
      type: String, 
      enum: ['INITIAL_SETUP', 'STAFF_FIRST_LOGIN', 'LOGIN_OTP'], 
      required: true 
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// Auto-clean records after 1 hour
VerificationOtpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

export const VerificationOtp = model<IVerificationOtp>('VerificationOtp', VerificationOtpSchema);
