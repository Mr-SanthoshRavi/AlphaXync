import { Router } from 'express';
import {
  login,
  logout,
  getCurrentUser,
  initialSetup,
  getSetupStatus,
  sendSetupOtp,
  verifySetupOtp,
  resendSetupOtp,
  verifyLoginOtp,
  getStaffUsers,
  createStaffUser,
  updateStaffUser,
  deleteStaffUser
} from './authController';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimiter';

const router = Router();

// Authentication Core
router.post('/login', authLimiter, login);
router.post('/verify-login-otp', authLimiter, verifyLoginOtp);
router.post('/logout', logout);
router.get('/me', authenticate, getCurrentUser);

// Setup & Resend OTP Verification
router.get('/setup-status', getSetupStatus);
router.post('/setup/send-otp', authLimiter, sendSetupOtp);
router.post('/setup/verify-otp', authLimiter, verifySetupOtp);
router.post('/setup/resend-otp', authLimiter, resendSetupOtp);
router.post('/setup', authLimiter, initialSetup);

// Staff Account Management (ADMIN-ONLY)
router.get('/staff', authenticate, requireAdmin, getStaffUsers);
router.post('/staff', authenticate, requireAdmin, createStaffUser);
router.patch('/staff/:id', authenticate, requireAdmin, updateStaffUser);
router.put('/staff/:id', authenticate, requireAdmin, updateStaffUser);
router.delete('/staff/:id', authenticate, requireAdmin, deleteStaffUser);

export const authRoutes = router;
