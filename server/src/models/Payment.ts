import { Schema, model, Document, Types } from 'mongoose';

export type PaymentMethod = 'RAZORPAY' | 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'OFFLINE' | 'UPI';
export type PaymentProvider = 'RAZORPAY' | 'MANUAL';
export type PaymentStatus = 'CREATED' | 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

export interface IPayment extends Document {
  institutionId: Types.ObjectId;
  studentId: Types.ObjectId;
  feeAccountId: Types.ObjectId;
  amount: number;
  currency: string;
  method: PaymentMethod;
  provider: PaymentProvider;
  providerOrderId?: string;
  providerPaymentId?: string;
  status: PaymentStatus;
  verifiedAt?: Date;
  reference?: string;
  note?: string;
  enteredBy?: Types.ObjectId;
  receiptNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    feeAccountId: { type: Schema.Types.ObjectId, ref: 'FeeAccount', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR', uppercase: true },
    method: { 
      type: String, 
      enum: ['RAZORPAY', 'CASH', 'CHEQUE', 'BANK_TRANSFER', 'OFFLINE', 'UPI'], 
      required: true 
    },
    provider: { type: String, enum: ['RAZORPAY', 'MANUAL'], required: true },
    providerOrderId: { type: String, sparse: true },
    providerPaymentId: { type: String, sparse: true },
    status: { 
      type: String, 
      enum: ['CREATED', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'CANCELLED'], 
      default: 'PENDING' 
    },
    verifiedAt: { type: Date },
    reference: { type: String, trim: true },
    note: { type: String, trim: true },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    receiptNumber: { type: String, trim: true }
  },
  { timestamps: true }
);

PaymentSchema.index(
  { institutionId: 1, providerOrderId: 1 },
  { unique: true, partialFilterExpression: { providerOrderId: { $type: 'string' } } }
);
PaymentSchema.index(
  { institutionId: 1, providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } } }
);
PaymentSchema.index({ institutionId: 1, status: 1 });
PaymentSchema.index({ institutionId: 1, verifiedAt: 1 });

export const Payment = model<IPayment>('Payment', PaymentSchema);
