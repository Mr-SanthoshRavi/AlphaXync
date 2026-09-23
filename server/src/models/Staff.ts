import { Schema, model, Document, Types } from 'mongoose';

export interface IStaff extends Document {
  institutionId: Types.ObjectId;
  staffId: string;
  name: string;
  department: string;
  whatsappNumber: string;
  salaryDate?: string;
  incrementDate?: string;
  status: 'ACTIVE' | 'INACTIVE';
  communicationOptOut?: boolean;
  optOutAt?: Date;
  optOutSource?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema = new Schema<IStaff>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    staffId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    whatsappNumber: { type: String, required: true, trim: true },
    salaryDate: { type: String, trim: true },
    incrementDate: { type: String, trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    communicationOptOut: { type: Boolean, default: false },
    optOutAt: { type: Date },
    optOutSource: { type: String }
  },
  { timestamps: true }
);

StaffSchema.index({ institutionId: 1, staffId: 1 }, { unique: true });

export const Staff = model<IStaff>('Staff', StaffSchema);
