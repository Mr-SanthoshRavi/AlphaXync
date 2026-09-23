import { Schema, model, Document, Types } from 'mongoose';

export type PaymentIntentStatus = 'CREATED' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

export interface IPaymentIntent extends Document {
  institutionId: Types.ObjectId;
  studentId: Types.ObjectId;
  feeAccountId: Types.ObjectId;
  amount: number;
  currency: string;
  status: PaymentIntentStatus;
  razorpayOrderId?: string;
  paymentToken: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentIntentSchema = new Schema<IPaymentIntent>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    feeAccountId: { type: Schema.Types.ObjectId, ref: 'FeeAccount', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR', uppercase: true },
    status: { type: String, enum: ['CREATED', 'COMPLETED', 'EXPIRED', 'CANCELLED'], default: 'CREATED' },
    razorpayOrderId: { type: String },
    paymentToken: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

export const PaymentIntent = model<IPaymentIntent>('PaymentIntent', PaymentIntentSchema);
