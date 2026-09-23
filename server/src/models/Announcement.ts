import { Schema, model, Document, Types } from 'mongoose';

export type AnnouncementType = 'EXAM' | 'HOLIDAY' | 'EVENT' | 'GENERAL';
export type AnnouncementStatus = 'DRAFT' | 'SCHEDULED' | 'SENT' | 'CANCELLED';

export interface IAnnouncement extends Document {
  institutionId: Types.ObjectId;
  announcementId: string;
  title: string;
  type: AnnouncementType;
  message: string;
  target: 'ALL' | 'DEPARTMENT' | 'COURSE' | 'YEAR' | 'SECTION';
  targetValue?: string;
  sendAt: Date;
  status: AnnouncementStatus;
  sentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    announcementId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ['EXAM', 'HOLIDAY', 'EVENT', 'GENERAL'], default: 'GENERAL' },
    message: { type: String, required: true },
    target: { type: String, enum: ['ALL', 'DEPARTMENT', 'COURSE', 'YEAR', 'SECTION'], default: 'ALL' },
    targetValue: { type: String },
    sendAt: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ['DRAFT', 'SCHEDULED', 'SENT', 'CANCELLED'], default: 'DRAFT' },
    sentCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

AnnouncementSchema.index({ institutionId: 1, announcementId: 1 }, { unique: true });
AnnouncementSchema.index({ institutionId: 1, status: 1, sendAt: 1 });

export const Announcement = model<IAnnouncement>('Announcement', AnnouncementSchema);
