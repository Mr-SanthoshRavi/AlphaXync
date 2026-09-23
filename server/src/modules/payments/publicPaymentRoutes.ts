import { Router } from 'express';
import {
  getPaymentPage,
  createCheckoutOrder,
  verifyPublicPayment
} from './publicPaymentController';
import { publicPayLimiter } from '../../middleware/rateLimiter';

const router = Router();

// Public routes (rate-limited, no auth required)
router.get('/:token', publicPayLimiter, getPaymentPage);
router.post('/:token/order', publicPayLimiter, createCheckoutOrder);
router.post('/:token/verify', publicPayLimiter, verifyPublicPayment);

export const publicPaymentRoutes = router;
