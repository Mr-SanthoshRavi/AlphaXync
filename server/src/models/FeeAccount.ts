import { Schema, model, Document, Types } from 'mongoose';

export type FeeStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface IFeeAccount extends Document {
  institutionId: Types.ObjectId;
  studentId: Types.ObjectId;
  academicYear: string;
  feeType: string;
  semester?: string;
  totalAmount: number;
  paidAmount: number; // Server-calculated only from verified transactions
  balance: number;    // Server-calculated: totalAmount - paidAmount
  dueDate: Date;
  fineDate?: Date;
  fineAmount: number;
  status: FeeStatus;
  createdAt: Date;
  updatedAt: Date;
}

const FeeAccountSchema = new Schema<IFeeAccount>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    academicYear: { type: String, required: true, trim: true },
    feeType: { type: String, required: true, default: 'Tuition Fee', trim: true },
    semester: { type: String, trim: true },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, default: 0, min: 0 },
    balance: { type: Number, required: true, default: 0 },
    dueDate: { type: Date, required: true },
    fineDate: { type: Date },
    fineAmount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'], default: 'PENDING' }
  },
  { timestamps: true }
);

FeeAccountSchema.index({ institutionId: 1, studentId: 1, academicYear: 1, feeType: 1 }, { unique: true });
FeeAccountSchema.index({ institutionId: 1, status: 1 });
FeeAccountSchema.index({ institutionId: 1, dueDate: 1 });

export const FeeAccount = model<IFeeAccount>('FeeAccount', FeeAccountSchema);
