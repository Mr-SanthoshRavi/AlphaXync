import { Schema, model, Document, Types } from 'mongoose';

export interface IReceipt extends Document {
  receiptNumber: string;
  institutionId: Types.ObjectId;
  studentId: Types.ObjectId;
  paymentId: Types.ObjectId;
  amount: number;
  paymentDate: Date;
  transactionReference: string;
  pdfUrl?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const ReceiptSchema = new Schema<IReceipt>(
  {
    receiptNumber: { type: String, required: true, unique: true, index: true },
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true, index: true },
    amount: { type: Number, required: true },
    paymentDate: { type: Date, required: true, default: Date.now },
    transactionReference: { type: String, required: true },
    pdfUrl: { type: String },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

export const Receipt = model<IReceipt>('Receipt', ReceiptSchema);
