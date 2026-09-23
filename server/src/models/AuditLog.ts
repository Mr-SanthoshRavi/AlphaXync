import { Schema, model, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  institutionId: Types.ObjectId;
  actorUserId?: Types.ObjectId;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  reason?: string;
  ipAddress?: string;
  timestamp: Date;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorRole: { type: String, default: 'SYSTEM' },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    reason: { type: String },
    ipAddress: { type: String },
    timestamp: { type: Date, default: Date.now, index: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ institutionId: 1, timestamp: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
