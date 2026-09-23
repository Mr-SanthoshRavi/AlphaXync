import { Schema, model, Document, Types } from 'mongoose';

export type MessageStatus =
  | 'QUEUED'
  | 'WAITING'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'RETRY_PENDING'
  | 'CANCELLED'
  | 'SKIPPED';

export type MessageSource = 'MANUAL' | 'AUTOMATION';

export interface IMessage extends Document {
  jobId?: Types.ObjectId;
  institutionId: Types.ObjectId;
  studentId?: Types.ObjectId;
  staffId?: Types.ObjectId;
  automationId?: Types.ObjectId;
  recipient: string;
  messageType?: string;
  templateName?: string;
  body?: string;
  payload?: Record<string, any>;
  provider: string;
  providerMessageId?: string;
  status: MessageStatus;
  source: MessageSource;
  attempts: number;
  nextAttemptAt?: Date;
  lastError?: string;
  communicationOptOut?: boolean;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    automationId: { type: Schema.Types.ObjectId, ref: 'Automation' },
    recipient: { type: String, required: true, trim: true },
    messageType: { type: String, trim: true },
    templateName: { type: String, trim: true },
    body: { type: String },
    payload: { type: Schema.Types.Mixed },
    provider: { type: String, default: 'baileys' },
    providerMessageId: { type: String },
    status: {
      type: String,
      enum: [
        'QUEUED',
        'WAITING',
        'SENDING',
        'SENT',
        'DELIVERED',
        'READ',
        'FAILED',
        'RETRY_PENDING',
        'CANCELLED',
        'SKIPPED'
      ],
      default: 'QUEUED'
    },
    source: {
      type: String,
      enum: ['MANUAL', 'AUTOMATION'],
      default: 'AUTOMATION'
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date },
    lastError: { type: String },
    communicationOptOut: { type: Boolean, default: false },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    failedAt: { type: Date },
    failureReason: { type: String },
    idempotencyKey: { type: String, required: true }
  },
  { timestamps: true }
);

MessageSchema.index({ institutionId: 1, idempotencyKey: 1 }, { unique: true });
MessageSchema.index({ institutionId: 1, status: 1 });
MessageSchema.index({ institutionId: 1, recipient: 1 });
MessageSchema.index({ providerMessageId: 1 }, { sparse: true });
MessageSchema.index({ source: 1 });

export const Message = model<IMessage>('Message', MessageSchema);
