import { Types } from 'mongoose';
import { SyncConflict, ISyncConflict } from '../../models/SyncConflict';
import { FeeAccount } from '../../models/FeeAccount';
import { Payment } from '../../models/Payment';
import { AuditLog } from '../../models/AuditLog';
import { logger } from '../../utils/logger';

export interface CheckConflictParams {
  institutionId: Types.ObjectId;
  studentId: Types.ObjectId;
  sourcePaidAmount?: number;
  sourcePaymentStatus?: string;
}

export async function detectAndRecordConflict(params: CheckConflictParams): Promise<ISyncConflict | null> {
  const { institutionId, studentId, sourcePaidAmount, sourcePaymentStatus } = params;

  // Check verified ledger payments in application database
  const capturedPayments = await Payment.find({
    institutionId,
    studentId,
    status: 'CAPTURED'
  });

  if (capturedPayments.length === 0) {
    // No verified online/cashier payments in app; source can populate initial values safely
    return null;
  }

  const feeAccount = await FeeAccount.findOne({ institutionId, studentId });
  if (!feeAccount) {
    return null;
  }

  // If source sheet paid amount differs from verified feeAccount.paidAmount
  if (sourcePaidAmount !== undefined && Number(sourcePaidAmount) !== feeAccount.paidAmount) {
    // Check if an open conflict already exists for this field
    let conflict = await SyncConflict.findOne({
      institutionId,
      studentId,
      field: 'paidAmount',
      status: 'OPEN'
    });

    if (!conflict) {
      conflict = await SyncConflict.create({
        institutionId,
        studentId,
        field: 'paidAmount',
        applicationValue: `₹${feeAccount.paidAmount}`,
        sourceValue: `₹${sourcePaidAmount}`,
        detectedAt: new Date(),
        status: 'OPEN'
      });

      await AuditLog.create({
        institutionId,
        action: 'SYNC_CONFLICT_DETECTED',
        entityType: 'STUDENT',
        entityId: studentId.toString(),
        before: { verifiedPaidAmount: feeAccount.paidAmount },
        after: { sourcePaidAmount },
        reason: 'Source sheet paid amount differs from protected application ledger'
      });

      logger.warn('SYNC_CONFLICT_DETECTED', `Conflict on student ${studentId}: app ₹${feeAccount.paidAmount} vs source ₹${sourcePaidAmount}`);
    }

    return conflict;
  }

  return null;
}

export async function resolveConflict(
  conflictId: string,
  resolution: 'KEEP_VERIFIED_VALUE' | 'ACCEPT_SOURCE_CHANGE',
  adminUserId: Types.ObjectId,
  notes?: string
) {
  const conflict = await SyncConflict.findById(conflictId);
  if (!conflict || conflict.status !== 'OPEN') {
    throw new Error('Conflict not found or already resolved');
  }

  conflict.status = 'RESOLVED';
  conflict.resolution = resolution;
  conflict.resolvedBy = adminUserId;
  conflict.resolvedAt = new Date();
  await conflict.save();

  if (resolution === 'ACCEPT_SOURCE_CHANGE' && conflict.field === 'paidAmount') {
    // Admin explicitly overrides ledger with source
    const rawVal = Number(conflict.sourceValue.replace(/[^0-9.]/g, ''));
    const feeAccount = await FeeAccount.findOne({
      institutionId: conflict.institutionId,
      studentId: conflict.studentId
    });
    if (feeAccount) {
      const oldPaid = feeAccount.paidAmount;
      feeAccount.paidAmount = rawVal;
      feeAccount.balance = Math.max(0, feeAccount.totalAmount - rawVal);
      feeAccount.status = feeAccount.balance === 0 ? 'PAID' : rawVal > 0 ? 'PARTIAL' : 'PENDING';
      await feeAccount.save();

      await AuditLog.create({
        institutionId: conflict.institutionId,
        actorUserId: adminUserId,
        actorRole: 'ADMIN',
        action: 'CONFLICT_RESOLVED_OVERRIDE',
        entityType: 'FEE_ACCOUNT',
        entityId: feeAccount._id.toString(),
        before: { paidAmount: oldPaid },
        after: { paidAmount: rawVal },
        reason: notes || 'Admin accepted source sheet value override'
      });
    }
  } else {
    // Keep verified value
    await AuditLog.create({
      institutionId: conflict.institutionId,
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      action: 'CONFLICT_RESOLVED_KEEP_VERIFIED',
      entityType: 'STUDENT',
      entityId: conflict.studentId.toString(),
      reason: notes || 'Admin preserved verified payment ledger'
    });
  }

  return conflict;
}
