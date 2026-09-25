import { Types } from 'mongoose';
import { DataConnection } from '../../models/DataConnection';
import { Student } from '../../models/Student';
import { FeeAccount } from '../../models/FeeAccount';
import { Payment } from '../../models/Payment';
import { Job } from '../../models/Job';
import { DataSourceAdapter, SyncMetrics } from '../../integrations/DataSourceAdapter';
import { MockGoogleSheetsAdapter } from '../../integrations/MockGoogleSheetsAdapter';
import { GoogleSheetsAdapter } from '../../integrations/GoogleSheetsAdapter';
import { ExcelAdapter } from '../../integrations/ExcelAdapter';
import { XlsxAdapter } from '../../integrations/XlsxAdapter';
import { applyMapping } from './mappingEngine';
import { validateStudentRow, parseFlexibleDate } from './validationEngine';
import { detectAndRecordConflict } from './conflictEngine';
import { calculateHash } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { AuditLog } from '../../models/AuditLog';
import { isMockMode } from '../../config/env';
import { getValidGoogleCredentials } from '../connections/googleConnectionController';

let sharedMockSheetsAdapter: MockGoogleSheetsAdapter | null = null;

export function getSharedMockGoogleSheetsAdapter(): MockGoogleSheetsAdapter {
  if (!sharedMockSheetsAdapter) {
    sharedMockSheetsAdapter = new MockGoogleSheetsAdapter();
  }
  return sharedMockSheetsAdapter;
}

export async function getAdapterForConnection(connection: any): Promise<DataSourceAdapter> {
  const isMock = isMockMode() || (process.env.NODE_ENV === 'test' && connection.accountReference?.includes('mock'));

  switch (connection.provider) {
    case 'google_sheets':
      if (isMock) {
        return getSharedMockGoogleSheetsAdapter();
      }
      return new GoogleSheetsAdapter();
    case 'microsoft_excel':
      if (isMock) {
        return getSharedMockGoogleSheetsAdapter();
      }
      return new ExcelAdapter();
    case 'xlsx_import':
      return new XlsxAdapter();
    default:
      if (isMock) {
        return getSharedMockGoogleSheetsAdapter();
      }
      throw new Error(`Unsupported data provider: ${connection.provider}`);
  }
}

export async function runSync(connectionId: string, customAdapter?: DataSourceAdapter): Promise<SyncMetrics> {
  const connection = await DataConnection.findById(connectionId);
  if (!connection) {
    throw new Error(`DataConnection ${connectionId} not found`);
  }

  const institutionId = connection.institutionId;
  const academicYear = '2026-27'; // Standard current academic year
  const adapter = customAdapter || (await getAdapterForConnection(connection));

  // Connect adapter with configured credentials
  let credentials: any = (connection as any).credentials || {};
  if (connection.provider === 'google_sheets' && !customAdapter) {
    try {
      const googleCreds = await getValidGoogleCredentials(connection);
      credentials = {
        accessToken: googleCreds.accessToken,
        spreadsheetId: googleCreds.spreadsheetId || connection.fileReference || connection.sheetReference
      };
    } catch (err: any) {
      if (!isMockMode()) {
        connection.status = 'AUTH_REQUIRED';
        connection.syncStatus = 'Google OAuth authorization required';
        connection.lastError = err.message;
        await connection.save();
        throw err;
      }
    }
  }

  await adapter.connect(credentials);

  logger.info('SYNC_STARTED', `Starting synchronization for connection ${connection.provider}`);

  connection.status = 'SYNCING';
  connection.syncStatus = 'Synchronizing...';
  await connection.save();

  const metrics: SyncMetrics = {
    rowsRead: 0,
    rowsAdded: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    rowsInvalid: 0,
    rowsConflicted: 0,
    rowsDeletedDetected: 0
  };

  try {
    const sheetName = connection.sheetReference || 'Students_Master';
    const rows = await adapter.readRows(sheetName);
    metrics.rowsRead = rows.length;

    // Convert Mongoose Map to plain object
    const mapping: Record<string, string> =
      connection.columnMapping instanceof Map
        ? Object.fromEntries(connection.columnMapping)
        : connection.columnMapping || {};

    const seenExternalIds = new Set<string>();
    const seenPhones = new Map<string, string>();

    for (const row of rows) {
      const mapped = applyMapping(row.values, mapping);
      const validation = validateStudentRow(mapped);

      const externalStudentId = mapped.externalStudentId ? String(mapped.externalStudentId).trim() : '';
      if (!externalStudentId) {
        continue;
      }

      // Check duplicate phone number in current batch
      if (validation.normalizedPhone) {
        if (seenPhones.has(validation.normalizedPhone)) {
          const priorId = seenPhones.get(validation.normalizedPhone);
          validation.issues.push(`Duplicate WhatsApp number shared with ${priorId}`);
          if (validation.status === 'VALID') {
            validation.status = 'WARNING';
          }
        } else {
          seenPhones.set(validation.normalizedPhone, externalStudentId);
        }

        // Check duplicate phone number with active students in DB
        const existingWithSamePhone = await Student.findOne({
          institutionId,
          whatsappNumber: validation.normalizedPhone,
          externalStudentId: { $ne: externalStudentId },
          status: 'ACTIVE'
        });
        if (existingWithSamePhone && !validation.issues.some(i => i.startsWith('Duplicate WhatsApp number'))) {
          validation.issues.push(`Duplicate WhatsApp number shared with ${existingWithSamePhone.externalStudentId}`);
          if (validation.status === 'VALID') {
            validation.status = 'WARNING';
          }
        }
      }

      if (validation.status === 'INVALID') {
        metrics.rowsInvalid++;
      }

      seenExternalIds.add(externalStudentId);

      const sourceHash = calculateHash(mapped);

      let student = await Student.findOne({
        institutionId,
        externalStudentId
      });

      if (!student) {
        // --- NEW STUDENT ---
        student = await Student.create({
          institutionId,
          academicYear,
          externalStudentId,
          sourceProvider: connection.provider,
          sourceSheetId: sheetName,
          sourceRowReference: row.rowReference,
          name: mapped.name || 'Unknown',
          fatherName: mapped.fatherName,
          whatsappNumber: validation.normalizedPhone || (mapped.whatsappNumber ? String(mapped.whatsappNumber).trim() : ''),
          course: mapped.course,
          department: mapped.department,
          year: mapped.year,
          section: mapped.section,
          status: 'ACTIVE',
          validationStatus: validation.status,
          validationIssues: validation.issues,
          rawSourceData: row.values,
          sourceHash,
          lastSourceSyncAt: new Date()
        });

        const totalAmount = Number(mapped.totalFee) || 0;
        const initialPaid = Number(mapped.paidAmount) || 0;
        const initialBalance = Math.max(0, totalAmount - initialPaid);
        const dueDate = parseFlexibleDate(mapped.dueDate) || new Date(Date.now() + 30 * 24 * 3600 * 1000);

        await FeeAccount.create({
          institutionId,
          studentId: student._id,
          academicYear,
          feeType: 'Tuition Fee',
          totalAmount,
          paidAmount: initialPaid,
          balance: initialBalance,
          dueDate,
          fineAmount: Number(mapped.fineAmount) || 0,
          status: initialBalance === 0 ? 'PAID' : initialPaid > 0 ? 'PARTIAL' : 'PENDING'
        });

        metrics.rowsAdded++;
      } else {
        // --- EXISTING STUDENT ---
        if (student.status !== 'ACTIVE') {
          student.status = 'ACTIVE';
          student.lastSourceSyncAt = new Date();
          await student.save();
        }

        if (student.sourceHash === sourceHash) {
          // No changes detected
          metrics.rowsSkipped++;
          continue;
        }

        // Check for protected payment conflict
        const sourcePaidAmount = mapped.paidAmount !== undefined ? Number(mapped.paidAmount) : undefined;
        const conflict = await detectAndRecordConflict({
          institutionId,
          studentId: student._id as Types.ObjectId,
          sourcePaidAmount,
          sourcePaymentStatus: mapped.paymentStatus
        });

        if (conflict) {
          metrics.rowsConflicted++;
        }

        // Update non-protected details
        student.name = mapped.name || student.name;
        student.fatherName = mapped.fatherName || student.fatherName;
        student.whatsappNumber = validation.normalizedPhone || (mapped.whatsappNumber ? String(mapped.whatsappNumber).trim() : '');
        student.course = mapped.course || student.course;
        student.department = mapped.department || student.department;
        student.year = mapped.year || student.year;
        student.section = mapped.section || student.section;
        student.validationStatus = validation.status;
        student.validationIssues = validation.issues;
        student.rawSourceData = row.values;
        student.sourceHash = sourceHash;
        student.sourceRowReference = row.rowReference || student.sourceRowReference;
        student.sourceSheetId = sheetName || student.sourceSheetId;
        student.lastSourceSyncAt = new Date();
        student.status = 'ACTIVE'; // Student is present in source
        await student.save();

        // Update fee details (unless conflict is open)
        if (!conflict) {
          const feeAccount = await FeeAccount.findOne({ institutionId, studentId: student._id });
          if (feeAccount) {
            // Reconcile paid amount:
            // 1. Check for verified captured payments in application database
            const verifiedPayments = await Payment.find({
              institutionId,
              studentId: student._id,
              status: 'CAPTURED'
            }).sort({ createdAt: -1 });
            const verifiedTotalPaid = verifiedPayments.reduce((sum: number, p: any) => sum + p.amount, 0);

            if (verifiedPayments.length > 0) {
              // Application ledger is protected: paidAmount is from verified captured payments
              feeAccount.paidAmount = verifiedTotalPaid;
            } else if (mapped.paidAmount !== undefined && String(mapped.paidAmount).trim() !== '' && !isNaN(Number(mapped.paidAmount))) {
              // Sheet has an explicit paid amount and no app payments exist
              feeAccount.paidAmount = Number(mapped.paidAmount);
            } else {
              // No app payments and no sheet paid amount -> paidAmount must be 0
              feeAccount.paidAmount = 0;
            }

            if (mapped.totalFee !== undefined && !isNaN(Number(mapped.totalFee))) {
              feeAccount.totalAmount = Number(mapped.totalFee);
            }
            if (mapped.dueDate) {
              feeAccount.dueDate = parseFlexibleDate(mapped.dueDate) || feeAccount.dueDate;
            }
            if (mapped.fineAmount !== undefined && !isNaN(Number(mapped.fineAmount))) {
              feeAccount.fineAmount = Number(mapped.fineAmount);
            }

            feeAccount.balance = Math.max(0, feeAccount.totalAmount - feeAccount.paidAmount);
            feeAccount.status = feeAccount.balance === 0 && feeAccount.totalAmount > 0
              ? 'PAID'
              : feeAccount.paidAmount > 0
              ? 'PARTIAL'
              : 'PENDING';

            await feeAccount.save();

            // AUTO-CORRECT GOOGLE SHEET:
            // If the sheet has an altered/conflicting 'Paid Amount' that differs from the admin's verified ledger,
            // automatically force-revert the sheet cell back to the admin's true verified values!
            if (mapped.paidAmount !== undefined && Number(mapped.paidAmount) !== feeAccount.paidAmount && student.sourceRowReference) {
              const latestReceipt = verifiedPayments.length > 0 ? (verifiedPayments[0].receiptNumber || '') : '';
              await Job.create({
                type: 'SHEET_WRITE_BACK',
                payload: {
                  institutionId: institutionId.toString(),
                  studentId: student._id.toString(),
                  receiptNumber: latestReceipt,
                  paidAmount: feeAccount.paidAmount,
                  balance: feeAccount.balance,
                  status: feeAccount.status,
                  writeBackFields: {
                    'Paid Amount': feeAccount.paidAmount,
                    'Balance': feeAccount.balance,
                    'Payment Status': feeAccount.status,
                    ...(latestReceipt ? { 'Receipt No': latestReceipt } : {})
                  }
                },
                status: 'QUEUED'
              });
              logger.info('SHEET_AUTO_CORRECT_QUEUED', `Queued sheet overwrite for ${student.externalStudentId}: reverting sheet (${mapped.paidAmount}) to verified admin ledger (${feeAccount.paidAmount})`);
            }
          }
        }

        metrics.rowsUpdated++;
      }
    }

    // Identify disappeared students (Rule 41: SOURCE_MISSING, never hard-delete)
    const activeStudents = await Student.find({
      institutionId,
      status: 'ACTIVE'
    });

    for (const st of activeStudents) {
      if (!seenExternalIds.has(st.externalStudentId)) {
        st.status = 'SOURCE_MISSING';
        await st.save();
        metrics.rowsDeletedDetected++;
        logger.warn('STUDENT_SOURCE_MISSING', `Student ${st.externalStudentId} (${st.name}) missing from source spreadsheet`);
      }
    }

    connection.status = 'CONNECTED';
    connection.syncStatus = 'All systems synced';
    connection.lastSyncAt = new Date();
    connection.nextSyncAt = new Date(Date.now() + (connection.syncInterval || 30) * 1000);
    connection.metrics = metrics;
    connection.lastError = undefined;
    await connection.save();

    logger.info('SYNC_COMPLETED', `Sync finished for ${connection.provider}`, metrics as any);

    // Trigger automation evaluation for new students and fee accounts
    try {
      const { evaluateAllAutomations } = await import('../../workers/automationWorker');
      evaluateAllAutomations(institutionId).catch((autoErr) => {
        logger.warn('SYNC_AUTOMATION_EVAL_ERROR', `Non-blocking automation evaluation: ${autoErr.message}`);
      });
    } catch (autoImportErr) {
      // Non-blocking
    }

    // Auto-apply dynamic fee rules
    try {
      const { applyAllActiveRules } = await import('../fees/feeRuleEngine');
      await applyAllActiveRules(institutionId);
    } catch (feeRuleErr: any) {
      logger.warn('SYNC_FEE_RULE_ERROR', `Failed to apply fee rules during sync: ${feeRuleErr.message}`);
    }

    // Process queued sheet write-back / auto-correct jobs immediately
    try {
      const { processSheetWriteBackBatch } = await import('../fees/feeController');
      processSheetWriteBackBatch(institutionId).catch(wbErr => {
        logger.warn('SYNC_WRITEBACK_ERROR', `Sheet write-back worker error: ${wbErr.message}`);
      });
    } catch (wbImportErr) {}

    // Broadcast Real-time SSE Events to active browser sessions
    try {
      const { broadcastEvent } = await import('../events/eventStream');
      const hasChanges = metrics.rowsAdded > 0 || metrics.rowsUpdated > 0 || metrics.rowsDeletedDetected > 0;

      broadcastEvent(institutionId.toString(), 'SYNC_COMPLETED', {
        type: 'SYNC_COMPLETED',
        metrics,
        connectionId: connection._id,
        timestamp: new Date().toISOString()
      });
      
      if (hasChanges) {
        broadcastEvent(institutionId.toString(), 'DATA_UPDATED', {
          type: 'DATA_UPDATED',
          source: connection.provider,
          metrics,
          timestamp: new Date().toISOString()
        });
      }
    } catch (broadcastErr) {
      // Non-blocking SSE broadcast
    }

    return metrics;
  } catch (error: any) {
    connection.status = 'ERROR';
    connection.syncStatus = 'Sync error';
    connection.lastError = error.message;
    await connection.save();
    logger.error('SYNC_FAILED', `Sync failed: ${error.message}`);
    throw error;
  }
}
