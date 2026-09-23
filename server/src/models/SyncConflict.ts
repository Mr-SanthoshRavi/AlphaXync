import { Schema, model, Document, Types } from 'mongoose';

export type ConflictStatus = 'OPEN' | 'RESOLVED' | 'IGNORED';

export interface ISyncConflict extends Document {
  institutionId: Types.ObjectId;
  studentId: Types.ObjectId;
  field: string;
  applicationValue: string;
  sourceValue: string;
  detectedAt: Date;
  status: ConflictStatus;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  resolution?: string; // 'KEEP_VERIFIED_VALUE' | 'ACCEPT_SOURCE_CHANGE' | string
  createdAt: Date;
  updatedAt: Date;
}

const SyncConflictSchema = new Schema<ISyncConflict>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    field: { type: String, required: true },
    applicationValue: { type: String, required: true },
    sourceValue: { type: String, required: true },
    detectedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['OPEN', 'RESOLVED', 'IGNORED'], default: 'OPEN' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    resolution: { type: String }
  },
  { timestamps: true }
);

SyncConflictSchema.index({ institutionId: 1, status: 1 });

export const SyncConflict = model<ISyncConflict>('SyncConflict', SyncConflictSchema);
