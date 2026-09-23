import { Router } from 'express';
import {
  recordOfflinePayment,
  adjustFee,
  waiveFine,
  changeDueDate,
  createPaymentRequest,
  aiReconcilePayment
} from './paymentController';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

// Cashiers & Admins can record offline payments & create payment requests
router.post('/offline', recordOfflinePayment);
router.post('/request', createPaymentRequest);
router.post('/create-request', createPaymentRequest);
router.post('/ai-reconcile', aiReconcilePayment);

// Financial edits require ADMIN role
router.post('/adjust-fee', requireRole(['ADMIN']), adjustFee);
router.post('/waive-fine', requireRole(['ADMIN']), waiveFine);
router.post('/change-due-date', requireRole(['ADMIN']), changeDueDate);

export const paymentRoutes = router;
