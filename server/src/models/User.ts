import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'ADMIN' | 'STAFF' | 'CASHIER';
export type AccessMode = 'ALWAYS' | 'SHIFT_WINDOW' | 'EXPIRING';

export interface IAccessSchedule {
  mode: AccessMode;
  shiftStart?: string; // e.g. "09:00"
  shiftEnd?: string;   // e.g. "18:00"
  expiresAt?: Date | null;
}

export interface IUser extends Document {
  institutionId: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  accessSchedule: IAccessSchedule;
  permissions: string[];
  isEmailVerified: boolean;
  requiresOtpOnFirstLogin: boolean;
  failedLoginAttempts: number;
  lockoutUntil?: Date | null;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  isLocked(): boolean;
  isAccessAllowedNow(): { allowed: boolean; reason?: string };
}

const UserSchema = new Schema<IUser>(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: 'Institution', required: false },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'STAFF', 'CASHIER'], default: 'STAFF' },
    isActive: { type: Boolean, default: true },
    accessSchedule: {
      mode: { type: String, enum: ['ALWAYS', 'SHIFT_WINDOW', 'EXPIRING'], default: 'ALWAYS' },
      shiftStart: { type: String, default: '09:00' },
      shiftEnd: { type: String, default: '18:00' },
      expiresAt: { type: Date, default: null }
    },
    permissions: {
      type: [String],
      default: ['COLLECT_PAYMENTS', 'RECORD_OFFLINE', 'VIEW_STUDENTS']
    },
    isEmailVerified: { type: Boolean, default: false },
    requiresOtpOnFirstLogin: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },
    lastLoginAt: { type: Date }
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.passwordHash || typeof this.passwordHash !== 'string') {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

UserSchema.methods.isLocked = function (): boolean {
  return !!(this.lockoutUntil && this.lockoutUntil > new Date());
};

UserSchema.methods.isAccessAllowedNow = function (): { allowed: boolean; reason?: string } {
  // Admins are always allowed (case-insensitive)
  if (this.role && this.role.toUpperCase() === 'ADMIN') {
    return { allowed: true };
  }

  // Account suspended check
  if (this.isActive === false) {
    return {
      allowed: false,
      reason: 'Your staff account has been deactivated by the administrator.'
    };
  }

  const schedule = this.accessSchedule;
  if (!schedule || schedule.mode === 'ALWAYS') {
    return { allowed: true };
  }

  // Temporary expiration check
  if (schedule.mode === 'EXPIRING') {
    if (schedule.expiresAt && new Date() > new Date(schedule.expiresAt)) {
      return {
        allowed: false,
        reason: `Your temporary staff access expired on ${new Date(schedule.expiresAt).toLocaleDateString()}.`
      };
    }
    return { allowed: true };
  }

  // Shift window check (e.g. "09:00" to "18:00")
  if (schedule.mode === 'SHIFT_WINDOW') {
    const start = schedule.shiftStart || '09:00';
    const end = schedule.shiftEnd || '18:00';

    // Current local time HH:mm
    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;

    if (start <= end) {
      // Normal daytime shift (e.g. 09:00 to 18:00)
      if (currentTimeStr < start || currentTimeStr > end) {
        return {
          allowed: false,
          reason: `Access restricted. Your assigned cashier shift is from ${start} to ${end}. Current time is ${currentTimeStr}.`
        };
      }
    } else {
      // Overnight shift (e.g. 20:00 to 04:00)
      if (currentTimeStr < start && currentTimeStr > end) {
        return {
          allowed: false,
          reason: `Access restricted. Your assigned cashier shift is from ${start} to ${end}. Current time is ${currentTimeStr}.`
        };
      }
    }
  }

  return { allowed: true };
};

export const User = model<IUser>('User', UserSchema);
