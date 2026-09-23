import { Router } from 'express';
import { getFees, getFeeDetail, getFeeCategories, setFeeStructure, discoverDimensions, getFeeRules, createFeeRule, deleteFeeRule, previewRuleMatch } from './feeController';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

// Dynamic Fee Rules Engine
router.get('/discover-dimensions', requireRole(['ADMIN']), discoverDimensions);
router.post('/preview-rule-match', requireRole(['ADMIN']), previewRuleMatch);
router.get('/rules', requireRole(['ADMIN']), getFeeRules);
router.post('/rules', requireRole(['ADMIN']), createFeeRule);
router.delete('/rules/:id', requireRole(['ADMIN']), deleteFeeRule);

router.get('/', getFees);
router.get('/categories', getFeeCategories);
router.get('/:id', getFeeDetail);

// Fee structure bulk assignment (admin only)
router.post('/set-fee-structure', requireRole(['ADMIN']), setFeeStructure);

export const feeRoutes = router;
