import { Router } from 'express';
import {
  getGoogleAuthUrl,
  handleGoogleOAuthCallback,
  listGoogleSpreadsheets,
  selectGoogleSpreadsheet,
  getGoogleSpreadsheetTabs,
  selectGoogleTabs,
  disconnectGoogle
} from './googleConnectionController';
import {
  getWhatsAppStatus,
  connectWhatsApp,
  refreshWhatsAppQr,
  disconnectWhatsApp,
  logoutWhatsApp
} from './whatsappConnectionController';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// Public OAuth callback from Google consent screen
router.get('/google/callback', handleGoogleOAuthCallback);

// Authenticated connection operations
router.get('/google/auth-url', authenticate, requireRole(['ADMIN']), getGoogleAuthUrl);
router.get('/google/spreadsheets', authenticate, requireRole(['ADMIN']), listGoogleSpreadsheets);
router.post('/google/select-spreadsheet', authenticate, requireRole(['ADMIN']), selectGoogleSpreadsheet);
router.get('/google/tabs', authenticate, requireRole(['ADMIN']), getGoogleSpreadsheetTabs);
router.post('/google/select-tabs', authenticate, requireRole(['ADMIN']), selectGoogleTabs);
router.post('/google/disconnect', authenticate, requireRole(['ADMIN']), disconnectGoogle);

// WhatsApp Connection Operations (ADMIN only)
router.get('/whatsapp/status', authenticate, requireRole(['ADMIN']), getWhatsAppStatus);
router.post('/whatsapp/connect', authenticate, requireRole(['ADMIN']), connectWhatsApp);
router.post('/whatsapp/refresh-qr', authenticate, requireRole(['ADMIN']), refreshWhatsAppQr);
router.post('/whatsapp/disconnect', authenticate, requireRole(['ADMIN']), disconnectWhatsApp);
router.post('/whatsapp/logout', authenticate, requireRole(['ADMIN']), logoutWhatsApp);

export const connectionRoutes = router;

