import { Schema, model, Document, Types } from 'mongoose';

export interface IAutomationDelivery extends Document {
  institutionId: Types.ObjectId;
  automationId: Types.ObjectId;
  studentId?: Types.ObjectId;
  staffId?: Types.ObjectId;
  academicYear?: string;
  eventType: string; // e.g. 'GREETING', 'FEE_REMINDER_48H', 'ANNOUNCEMENT', 'COMPLAINT_ACK', 'STAFF_NOTICE'
  eventReference?: string; // e.g. AnnouncementId or FeeCycleId
  deliveredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AutomationDeliverySchema = new Schema<IAutomationDelivery>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    automationId: { type: Schema.Types.ObjectId, ref: 'Automation', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    academicYear: { type: String, default: 'ALL' },
    eventType: { type: String, required: true },
    eventReference: { type: String, default: 'DEFAULT' },
    deliveredAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Ensures strict deduplication
AutomationDeliverySchema.index(
  { institutionId: 1, automationId: 1, studentId: 1, staffId: 1, academicYear: 1, eventType: 1, eventReference: 1 },
  { sparse: true }
);

export const AutomationDelivery = model<IAutomationDelivery>('AutomationDelivery', AutomationDeliverySchema);
