import { Router } from 'express';
import { getAuditLogs } from './auditLogController';
import { authenticate, requireAdmin } from '../../middleware/auth';

const router = Router();

// Only Administrators can inspect institution-wide activity & audit trail
router.get('/', authenticate, requireAdmin, getAuditLogs);

export const auditLogRoutes = router;
