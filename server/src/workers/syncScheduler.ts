import { Types } from 'mongoose';
import { DataConnection } from '../models/DataConnection';
import { Automation } from '../models/Automation';
import { runSync } from '../modules/sync/syncEngine';
import { evaluateAllAutomations } from './automationWorker';
import { logger } from '../utils/logger';

let schedulerInterval: NodeJS.Timeout | null = null;
let isSyncInProgress = false;

export function startSyncScheduler(checkIntervalMs = 15000) {
  if (schedulerInterval) return;

  logger.info('SYNC_SCHEDULER_STARTED', `Background auto-sync and automation scheduler active (Polling interval: ${checkIntervalMs / 1000}s)`);

  schedulerInterval = setInterval(async () => {
    if (isSyncInProgress) return;

    try {
      isSyncInProgress = true;
      const now = Date.now();
      const connections = await DataConnection.find({
        status: 'CONNECTED',
        provider: { $in: ['google_sheets', 'microsoft_excel'] }
      });

      for (const conn of connections) {
        const intervalMs = Math.max(15, conn.syncInterval || 30) * 1000;
        const lastSync = conn.lastSyncAt ? new Date(conn.lastSyncAt).getTime() : 0;

        if (now - lastSync >= intervalMs) {
          try {
            await runSync(conn._id.toString());
          } catch (err: any) {
            logger.warn('AUTO_SYNC_CONN_ERROR', `Auto-sync cycle for connection ${conn._id}: ${err.message}`);
          }
        }
      }

      // Periodic automation evaluation for institutions with enabled automations
      try {
        const activeAutomations = await Automation.find({ enabled: true, isPaused: { $ne: true } }).select('institutionId').lean();
        const distinctInstitutionIds = Array.from(new Set(activeAutomations.map(a => a.institutionId.toString())));

        for (const instIdStr of distinctInstitutionIds) {
          try {
            await evaluateAllAutomations(new Types.ObjectId(instIdStr));
          } catch (autoEvalErr: any) {
            logger.warn('PERIODIC_AUTOMATION_ERROR', `Auto-eval for ${instIdStr}: ${autoEvalErr.message}`);
          }
        }
      } catch (e: any) {
        // Non-blocking
      }
    } catch (err: any) {
      logger.error('SYNC_SCHEDULER_ERROR', `Error in sync scheduler cycle: ${err.message}`);
    } finally {
      isSyncInProgress = false;
    }
  }, checkIntervalMs);
}

export function stopSyncScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('SYNC_SCHEDULER_STOPPED', 'Background auto-sync scheduler stopped');
  }
}
