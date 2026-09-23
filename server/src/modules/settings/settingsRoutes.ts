import { Router } from 'express';
import { getSettings, updateInstitution } from './settingsController';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', getSettings);
router.put('/institution', requireRole(['ADMIN']), updateInstitution);
router.patch('/institution', requireRole(['ADMIN']), updateInstitution);

export const settingsRoutes = router;
