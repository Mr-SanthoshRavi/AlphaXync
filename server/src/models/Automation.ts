import { Schema, model, Document, Types } from 'mongoose';

export type AutomationType = 'GREETING' | 'FEE' | 'ANNOUNCEMENT' | 'COMPLAINT' | 'STAFF' | 'CUSTOM';

export interface IAutomation extends Document {
  institutionId: Types.ObjectId;
  type: AutomationType;
  isSystem?: boolean;
  name?: string;
  description?: string;
  enabled: boolean;
  audience: {
    target: 'ALL' | 'DEPARTMENT' | 'COURSE' | 'YEAR' | 'SECTION' | 'SPECIFIC' | 'CRITERIA';
    departments?: string[];
    courses?: string[];
    years?: string[];
    sections?: string[];
    specificIds?: string[];
    criteria?: Array<{ field: string; operator?: string; value: string }>;
    feeStatus?: string;
  };
  conditions: Record<string, any>;
  schedule: {
    triggerType?: 'MANUAL' | 'ON_SYNC' | 'BEFORE_DUE_DATE' | 'AFTER_PAYMENT' | 'SCHEDULED' | 'RECURRING';
    scheduledDate?: Date;
    offsetDays?: number;
    timeOfDay?: string;
    repeatIntervalDays?: number;
    interval?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    maxExecutions?: number;
    reminders?: string[];
    [key: string]: any;
  };
  template: string;
  mediaUrl?: string;
  settings: Record<string, any>;
  minSendIntervalMs: number;
  isPaused: boolean;
  pauseReason?: string | null;
  circuitBreakerFailures: number;
  metrics?: {
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    lastTriggeredAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const AutomationSchema = new Schema<IAutomation>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    type: { 
      type: String, 
      enum: ['GREETING', 'FEE', 'ANNOUNCEMENT', 'COMPLAINT', 'STAFF', 'CUSTOM'], 
      required: true 
    },
    isSystem: { type: Boolean, default: false },
    name: { type: String },
    description: { type: String },
    mediaUrl: { type: String, default: null },
    enabled: { type: Boolean, default: false },
    audience: {
      target: { type: String, enum: ['ALL', 'STUDENTS', 'STAFF', 'CRITERIA'], default: 'ALL' },
      departments: [{ type: String }],
      courses: [{ type: String }],
      years: [{ type: String }],
      sections: [{ type: String }],
      criteria: [
        {
          field: { type: String },
          operator: { type: String, default: 'EQUALS' },
          value: { type: String }
        }
      ],
      feeStatus: { type: String, default: 'ALL' }
    },
    conditions: { type: Schema.Types.Mixed, default: {} },
    schedule: { type: Schema.Types.Mixed, default: {} },
    template: { type: String, default: '' },
    settings: { type: Schema.Types.Mixed, default: {} },
    minSendIntervalMs: { type: Number, default: 10000 },
    isPaused: { type: Boolean, default: false },
    pauseReason: { type: String, default: null },
    circuitBreakerFailures: { type: Number, default: 0 },
    metrics: {
      totalSent: { type: Number, default: 0 },
      totalDelivered: { type: Number, default: 0 },
      totalFailed: { type: Number, default: 0 },
      lastTriggeredAt: { type: Date }
    }
  },
  { timestamps: true }
);

// Uniqueness only applies to singleton system automation types, allowing unlimited CUSTOM campaigns
AutomationSchema.index(
  { institutionId: 1, type: 1 },
  { unique: true, partialFilterExpression: { isSystem: true } }
);

export const Automation = model<IAutomation>('Automation', AutomationSchema);
