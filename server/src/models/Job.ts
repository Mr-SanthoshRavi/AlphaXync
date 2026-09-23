import { Schema, model, Document } from 'mongoose';

export type JobType = 'SYNC' | 'AUTOMATION' | 'MESSAGE' | 'SHEET_WRITE_BACK';
export type JobStatus =
  | 'QUEUED'
  | 'WAITING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'SKIPPED'
  | 'RETRY_PENDING';

export interface IJob extends Document {
  type: JobType;
  payload: Record<string, any>;
  status: JobStatus;
  runAt: Date;
  attempts: number;
  maxAttempts: number;
  lockedAt?: Date | null;
  lockedBy?: string | null;
  lastError?: string | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    type: { type: String, enum: ['SYNC', 'AUTOMATION', 'MESSAGE', 'SHEET_WRITE_BACK'], required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['QUEUED', 'WAITING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED', 'RETRY_PENDING'],
      default: 'QUEUED'
    },
    runAt: { type: Date, default: Date.now, index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },
    lastError: { type: String, default: null },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

JobSchema.index({ status: 1, runAt: 1 });
JobSchema.index({ lockedAt: 1 });

export const Job = model<IJob>('Job', JobSchema);
