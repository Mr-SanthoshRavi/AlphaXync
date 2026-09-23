import { globalJobQueue } from './jobQueue';
import { processMessageJob } from './messageWorker';
import { processSheetWriteBackJob } from './sheetWriteBackWorker';
import { runSync } from '../modules/sync/syncEngine';
import {
  evaluateGreetings,
  evaluateFeeReminders,
  evaluateAnnouncements,
  evaluateComplaints,
  evaluateStaffNotices
} from './automationWorker';
import { startSyncScheduler, stopSyncScheduler } from './syncScheduler';
import { Types } from 'mongoose';
import { logger } from '../utils/logger';

export function initializeWorkers() {
  // Register MESSAGE job handler
  globalJobQueue.registerHandler('MESSAGE', async (job) => {
    await processMessageJob(job);
  });

  // Register SHEET_WRITE_BACK job handler
  globalJobQueue.registerHandler('SHEET_WRITE_BACK', async (job) => {
    await processSheetWriteBackJob(job);
  });

  // Register SYNC job handler
  globalJobQueue.registerHandler('SYNC', async (job) => {
    await runSync(job.payload.connectionId);
  });

  // Register AUTOMATION job handler (Evaluates all 5 modules)
  globalJobQueue.registerHandler('AUTOMATION', async (job) => {
    const institutionId = new Types.ObjectId(job.payload.institutionId);
    await evaluateGreetings(institutionId);
    await evaluateFeeReminders(institutionId);
    await evaluateAnnouncements(institutionId);
    await evaluateComplaints(institutionId);
    await evaluateStaffNotices(institutionId);
  });

  // Start background auto-sync scheduler (polls connected sheets every 15s)
  startSyncScheduler(15000);

  logger.info('WORKERS_INITIALIZED', 'All background job handlers and auto-sync scheduler started');
}

export { startSyncScheduler, stopSyncScheduler };
