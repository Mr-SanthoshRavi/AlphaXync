import { Router } from 'express';
import {
  getSyncStatus,
  triggerManualSync,
  getConflicts,
  resolveConflictEndpoint,
  discoverColumns,
  saveMapping,
  simulateSourceSheetUpdate
} from './syncController';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/status', getSyncStatus);
router.post('/trigger', triggerManualSync);
router.get('/conflicts', getConflicts);
router.post('/conflicts/:id/resolve', requireRole(['ADMIN']), resolveConflictEndpoint);
router.get('/discover', discoverColumns);
router.post('/mapping', requireRole(['ADMIN']), saveMapping);
router.post('/simulate-source-update', requireRole(['ADMIN']), simulateSourceSheetUpdate);

export const syncRoutes = router;
