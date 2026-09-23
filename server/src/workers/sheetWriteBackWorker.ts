import { IJob } from '../models/Job';
import { DataConnection } from '../models/DataConnection';
import { Student } from '../models/Student';
import { getAdapterForConnection } from '../modules/sync/syncEngine';
import { logger } from '../utils/logger';

export async function processSheetWriteBackJob(job: IJob): Promise<void> {
  const { institutionId, studentId, receiptNumber, paidAmount, balance, status } = job.payload;

  const student = await Student.findById(studentId);
  if (!student || !student.sourceRowReference) {
    logger.warn('SHEET_WRITE_BACK_SKIPPED', `No source row reference for student ${studentId}`);
    return;
  }

  const connection = await DataConnection.findOne({ institutionId });
  if (!connection) {
    logger.warn('SHEET_WRITE_BACK_NO_CONNECTION', `No active connection for institution ${institutionId}`);
    return;
  }

  const adapter = await getAdapterForConnection(connection);
  if (connection.provider === 'google_sheets') {
    try {
      const { getValidGoogleCredentials } = await import('../modules/connections/googleConnectionController');
      const googleCreds = await getValidGoogleCredentials(connection);
      await adapter.connect({
        accessToken: googleCreds.accessToken,
        spreadsheetId: googleCreds.spreadsheetId || connection.fileReference || connection.sheetReference
      });
    } catch (err: any) {
      logger.error('SHEET_WRITE_BACK_CONNECT_ERROR', `Failed to connect adapter for write-back: ${err.message}`);
      throw err;
    }
  }
  const sheetName = connection.sheetReference || 'Students_Master';

  const updates: Record<string, any> = {};
  if (job.payload.writeBackFields) {
    Object.assign(updates, job.payload.writeBackFields);
  } else {
    if (paidAmount !== undefined) updates['Paid Amount'] = paidAmount;
    if (balance !== undefined) updates['Balance'] = balance;
    if (status !== undefined) updates['Payment Status'] = status;
    if (receiptNumber) updates['Receipt No'] = receiptNumber;
    if (job.payload.totalFee !== undefined) updates['Total Fee'] = job.payload.totalFee;
    updates['Last Payment Date'] = new Date().toISOString().slice(0, 10);
  }

  try {
    const success = await adapter.updateRow(sheetName, student.sourceRowReference, updates);
    if (!success) {
      logger.warn('SHEET_WRITE_BACK_RETRY_QUEUED', `Failed to write back to row ${student.sourceRowReference}. Payment remains valid; write-back will retry.`);
      return;
    }
    logger.info('SHEET_WRITE_BACK_SUCCESS', `Successfully wrote back payment to ${student.sourceRowReference}`);
  } catch (err: any) {
    logger.warn('SHEET_WRITE_BACK_ERROR', `Write-back error for ${student.sourceRowReference}: ${err.message}. Payment ledger is secure.`);
  }
}
