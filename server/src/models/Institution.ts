import { Schema, model, Document } from 'mongoose';

export interface IReceiptSettings {
  headerTitleSize?: number;
  headerTitleColor?: string;
  headerSubtitleText?: string;
  headerSubtitleSize?: number;
  headerSubtitleColor?: string;
  badgeText?: string;
  headerLogoSize?: number;
  headerLogoPosition?: 'inline' | 'stacked';
  showWatermark?: boolean;
  watermarkCustomUrl?: string;
  watermarkSize?: number;
  watermarkOpacity?: number;
  watermarkRotation?: number;
  watermarkGrayscale?: boolean;
  bodyFontSize?: number;
  primaryColor?: string;
  textColor?: string;
  footerNotes?: string;
  signatoryLabel?: string;
  showSignatoryLine?: boolean;
}

export interface IInstitution extends Document {
  name: string;
  code: string;
  timezone: string;
  defaultCountryCode: string;
  logoUrl?: string;
  receiptSettings?: IReceiptSettings;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const InstitutionSchema = new Schema<IInstitution>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    defaultCountryCode: { type: String, default: '+91' },
    logoUrl: { type: String },
    receiptSettings: {
      headerTitleSize: { type: Number, default: 20 },
      headerTitleColor: { type: String, default: '#111827' },
      headerSubtitleText: { type: String, default: 'Institutional Operations & Accounts Department' },
      headerSubtitleSize: { type: Number, default: 12 },
      headerSubtitleColor: { type: String, default: '#4b5563' },
      badgeText: { type: String, default: 'FEE COLLECTION VOUCHER / OFFICIAL RECEIPT' },
      headerLogoSize: { type: Number, default: 44 },
      headerLogoPosition: { type: String, default: 'inline' },
      showWatermark: { type: Boolean, default: true },
      watermarkCustomUrl: { type: String, default: '' },
      watermarkSize: { type: Number, default: 280 },
      watermarkOpacity: { type: Number, default: 0.10 },
      watermarkRotation: { type: Number, default: -12 },
      watermarkGrayscale: { type: Boolean, default: true },
      bodyFontSize: { type: Number, default: 12 },
      primaryColor: { type: String, default: '#1e40af' },
      textColor: { type: String, default: '#1f2937' },
      footerNotes: { type: String, default: '• Computer generated official receipt.\n• Verified against institutional ledger.' },
      signatoryLabel: { type: String, default: 'Authorized Signatory' },
      showSignatoryLine: { type: Boolean, default: true }
    },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Institution = model<IInstitution>('Institution', InstitutionSchema);

