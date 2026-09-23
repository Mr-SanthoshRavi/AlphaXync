import { Schema, model, Document, Types } from 'mongoose';

export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'SOURCE_MISSING';
export type ValidationStatus = 'VALID' | 'INVALID' | 'WARNING' | 'CONFLICT';

export interface IStudent extends Document {
  institutionId: Types.ObjectId;
  academicYear: string;
  externalStudentId: string;
  sourceProvider: string;
  sourceFileId?: string;
  sourceSheetId?: string;
  sourceRowReference?: string;
  name: string;
  fatherName?: string;
  motherName?: string;
  whatsappNumber?: string;
  course?: string;
  department?: string;
  year?: string;
  section?: string;
  status: StudentStatus;
  validationStatus: ValidationStatus;
  validationIssues: string[];
  rawSourceData?: Record<string, any>;
  sourceHash?: string;
  lastSourceSyncAt?: Date;
  communicationOptOut?: boolean;
  optOutAt?: Date;
  optOutSource?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    academicYear: { type: String, required: true, trim: true },
    externalStudentId: { type: String, required: true, trim: true },
    sourceProvider: { type: String, default: 'manual' },
    sourceFileId: { type: String },
    sourceSheetId: { type: String },
    sourceRowReference: { type: String },
    name: { type: String, required: true, trim: true },
    fatherName: { type: String, trim: true },
    motherName: { type: String, trim: true },
    whatsappNumber: { type: String, trim: true },
    course: { type: String, trim: true },
    department: { type: String, trim: true },
    year: { type: String, trim: true },
    section: { type: String, trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'SOURCE_MISSING'], default: 'ACTIVE' },
    validationStatus: { type: String, enum: ['VALID', 'INVALID', 'WARNING', 'CONFLICT'], default: 'VALID' },
    validationIssues: { type: [String], default: [] },
    rawSourceData: { type: Schema.Types.Mixed },
    sourceHash: { type: String },
    lastSourceSyncAt: { type: Date },
    communicationOptOut: { type: Boolean, default: false },
    optOutAt: { type: Date },
    optOutSource: { type: String }
  },
  { timestamps: true }
);

// Primary unique composite identity
StudentSchema.index({ institutionId: 1, academicYear: 1, externalStudentId: 1 }, { unique: true });
StudentSchema.index({ institutionId: 1, whatsappNumber: 1 });
StudentSchema.index({ institutionId: 1, status: 1 });
StudentSchema.index({ institutionId: 1, validationStatus: 1 });

export const Student = model<IStudent>('Student', StudentSchema);
