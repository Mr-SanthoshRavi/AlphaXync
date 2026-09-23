import { Router } from 'express';
import {
  getAutomations,
  toggleAutomation,
  updateAutomation,
  previewDraft,
  pauseAllAutomations,
  resumeAllAutomations,
  updatePacingConfig,
  getAutomationSummary,
  triggerAutomations,
  getAutomationVariables,
  createCustomAutomation,
  updateCustomAutomation,
  deleteCustomAutomation,
  triggerSingleAutomation,
  getFilterOptions,
  getMatchingRecipientCount,
  aiPolishTemplate,
  uploadMedia
} from './automationController';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', getAutomations);
router.get('/variables', getAutomationVariables);
router.get('/filter-options', getFilterOptions);
router.post('/matching-count', getMatchingRecipientCount);
router.post('/ai-polish', aiPolishTemplate);
router.get('/summary', getAutomationSummary);
router.post('/preview', previewDraft);
router.post('/upload-media', requireRole(['ADMIN']), uploadMedia);

// Operational Controls (ADMIN only)
router.post('/trigger', requireRole(['ADMIN']), triggerAutomations);
router.post('/:id/trigger-single', requireRole(['ADMIN']), triggerSingleAutomation);
router.post('/pause', requireRole(['ADMIN']), pauseAllAutomations);
router.post('/resume', requireRole(['ADMIN']), resumeAllAutomations);
router.post('/pacing', requireRole(['ADMIN']), updatePacingConfig);

// Custom Campaign CRUD (ADMIN only)
router.post('/custom', requireRole(['ADMIN']), createCustomAutomation);
router.put('/custom/:id', requireRole(['ADMIN']), updateCustomAutomation);
router.delete('/custom/:id', requireRole(['ADMIN']), deleteCustomAutomation);

// Configuration editing for system singleton types (ADMIN only)
router.patch('/:type/toggle', requireRole(['ADMIN']), toggleAutomation);
router.put('/:type', requireRole(['ADMIN']), updateAutomation);

export const automationRoutes = router;

