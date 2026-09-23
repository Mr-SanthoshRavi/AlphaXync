import { Schema, model, Document, Types } from 'mongoose';

export type ConnectionProvider = 'google_sheets' | 'microsoft_excel' | 'xlsx_import';
export type ConnectionStatus = 'CONNECTED' | 'SYNCING' | 'DEGRADED' | 'AUTH_REQUIRED' | 'ERROR' | 'DISCONNECTED';

export interface IDataConnection extends Document {
  institutionId: Types.ObjectId;
  provider: ConnectionProvider;
  status: ConnectionStatus;
  accountReference?: string;
  fileReference?: string;
  sheetReference?: string;
  credentialsEncrypted?: string;
  columnMapping?: Record<string, string>;
  lastSyncAt?: Date;
  nextSyncAt?: Date;
  syncInterval: number; // in seconds
  syncStatus?: string;
  lastError?: string;
  metrics?: {
    rowsRead: number;
    rowsAdded: number;
    rowsUpdated: number;
    rowsSkipped: number;
    rowsInvalid: number;
    rowsConflicted: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const DataConnectionSchema = new Schema<IDataConnection>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    provider: { type: String, enum: ['google_sheets', 'microsoft_excel', 'xlsx_import'], required: true },
    status: { 
      type: String, 
      enum: ['CONNECTED', 'SYNCING', 'DEGRADED', 'AUTH_REQUIRED', 'ERROR', 'DISCONNECTED'], 
      default: 'DISCONNECTED' 
    },
    accountReference: { type: String },
    fileReference: { type: String },
    sheetReference: { type: String },
    credentialsEncrypted: { type: String },
    columnMapping: { type: Map, of: String, default: {} },
    lastSyncAt: { type: Date },
    nextSyncAt: { type: Date },
    syncInterval: { type: Number, default: 60 },
    syncStatus: { type: String, default: 'Idle' },
    lastError: { type: String },
    metrics: {
      rowsRead: { type: Number, default: 0 },
      rowsAdded: { type: Number, default: 0 },
      rowsUpdated: { type: Number, default: 0 },
      rowsSkipped: { type: Number, default: 0 },
      rowsInvalid: { type: Number, default: 0 },
      rowsConflicted: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

DataConnectionSchema.index({ institutionId: 1, provider: 1 }, { unique: true });

export const DataConnection = model<IDataConnection>('DataConnection', DataConnectionSchema);
