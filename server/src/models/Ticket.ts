import { Schema, model, Document, Types } from 'mongoose';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export interface ITicket extends Document {
  institutionId: Types.ObjectId;
  studentId?: Types.ObjectId;
  phone: string;
  senderName?: string;
  subject?: string;
  message: string;
  receivedAt: Date;
  status: TicketStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  assignedTo?: Types.ObjectId;
  notes?: string;
  replyHistory?: Array<{ sender: string; message: string; timestamp: Date }>;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TicketSchema = new Schema<ITicket>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    phone: { type: String, required: true, trim: true },
    senderName: { type: String, trim: true },
    subject: { type: String, trim: true, default: 'General Query' },
    message: { type: String, required: true },
    receivedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED'], default: 'OPEN' },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
    replyHistory: [
      {
        sender: { type: String, required: true },
        message: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    resolvedAt: { type: Date }
  },
  { timestamps: true }
);

TicketSchema.index({ institutionId: 1, status: 1 });
TicketSchema.index({ institutionId: 1, phone: 1 });

export const Ticket = model<ITicket>('Ticket', TicketSchema);
