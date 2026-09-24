import { Request, Response, NextFunction } from 'express';
import { getBaileysWhatsAppProvider } from '../../integrations/whatsapp/BaileysWhatsAppProvider';
import { env, isMockMode } from '../../config/env';
import { logger } from '../../utils/logger';
import { Institution } from '../../models/Institution';

let mockConnectedState = false;

export async function getWhatsAppStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = req.user?.institutionId;
    const inst = institutionId ? await Institution.findById(institutionId) : null;
    const dbStatus = inst?.whatsappConnection?.status || 'NOT_CONNECTED';

    if (isMockMode()) {
      const isConn = Boolean(mockConnectedState && dbStatus === 'CONNECTED');
      return res.status(200).json({
        success: true,
        data: {
          provider: 'mock',
          state: isConn ? 'CONNECTED' : 'NOT_CONNECTED',
          statusText: isConn ? 'CONNECTED ✓' : 'NOT CONNECTED',
          qrCode: null,
          maskedPhone: isConn ? (inst?.whatsappConnection?.phone || '+91 ••••• 0000') : null,
          lastError: null,
          hasStoredSession: isConn,
          minSendIntervalMs: env.MIN_SEND_INTERVAL_MS,
          concurrency: env.OUTBOUND_CONCURRENCY
        }
      });
    }

    const baileys = getBaileysWhatsAppProvider();
    let rawState = baileys.getConnectionState();
    let qrDataUrl = baileys.getQrDataUrl();
    let maskedPhone = baileys.getMaskedPhone();
    let lastError = baileys.getLastError();
    let hasStoredSession = baileys.hasStoredSession();

    if (dbStatus === 'NOT_CONNECTED' && rawState !== 'CONNECTED') {
      rawState = 'NOT_CONNECTED';
      maskedPhone = null;
    }

    let statusText = 'NOT CONNECTED';
    if (rawState === 'CONNECTED') {
      statusText = 'CONNECTED ✓';
    } else if (rawState === 'QR_REQUIRED' || rawState === 'AUTH_REQUIRED') {
      statusText = 'Scan this QR code with the WhatsApp account you want to use.';
    } else if (rawState === 'CONNECTING') {
      statusText = 'WhatsApp Connecting...';
    } else if (rawState === 'RECONNECTING') {
      statusText = 'WhatsApp disconnected. Reconnecting...';
    } else if (rawState === 'LOGGED_OUT') {
      statusText = 'WhatsApp account needs to be linked again.';
    } else if (rawState === 'ERROR') {
      statusText = lastError || 'Unable to generate WhatsApp QR. Please try again.';
    }

    return res.status(200).json({
      success: true,
      data: {
        provider: 'baileys',
        state: rawState,
        statusText,
        qrCode: qrDataUrl,
        maskedPhone,
        lastError,
        hasStoredSession,
        minSendIntervalMs: env.MIN_SEND_INTERVAL_MS,
        concurrency: env.OUTBOUND_CONCURRENCY
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function connectWhatsApp(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = req.user?.institutionId;

    if (isMockMode()) {
      mockConnectedState = true;
      if (institutionId) {
        await Institution.findByIdAndUpdate(institutionId, {
          $set: {
            'whatsappConnection.status': 'CONNECTED',
            'whatsappConnection.phone': '+91 ••••• 0000',
            'whatsappConnection.connectedAt': new Date()
          }
        });
      }
      return res.status(200).json({
        success: true,
        data: { state: 'CONNECTED', statusText: 'CONNECTED ✓', maskedPhone: '+91 ••••• 0000' }
      });
    }

    const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
    const baileys = getBaileysWhatsAppProvider();

    // In Vercel serverless, Baileys WebSocket cannot run 24/7 in an ephemeral lambda
    if (isServerless && (!baileys || baileys.getConnectionState() === 'NOT_CONNECTED')) {
      await baileys.initialize().catch(() => {});
      if (!baileys.getQrDataUrl() && baileys.getConnectionState() !== 'CONNECTED') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'BAILEYS_SERVERLESS_LIMITATION',
            message: 'WhatsApp Baileys requires a persistent 24/7 Node.js server (Render / Railway / VPS). For live Baileys, please point VITE_API_URL to your persistent backend host.'
          }
        });
      }
    }

    // Initialize in background if not already connected
    baileys.initialize().catch((err) => {
      logger.error('BAILEYS_INIT_ERROR', err.message);
    });

    return res.status(200).json({
      success: true,
      data: {
        message: 'WhatsApp connection initiated',
        state: baileys.getConnectionState()
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function refreshWhatsAppQr(req: Request, res: Response, next: NextFunction) {
  try {
    if (isMockMode()) {
      return res.status(200).json({
        success: true,
        data: { state: mockConnectedState ? 'CONNECTED' : 'NOT_CONNECTED', statusText: mockConnectedState ? 'CONNECTED ✓' : 'NOT CONNECTED' }
      });
    }

    const baileys = getBaileysWhatsAppProvider();
    await baileys.refreshQr();

    return res.status(200).json({
      success: true,
      data: {
        message: 'WhatsApp QR refreshed',
        state: baileys.getConnectionState(),
        qrCode: baileys.getQrDataUrl()
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function disconnectWhatsApp(req: Request, res: Response, next: NextFunction) {
  try {
    mockConnectedState = false;
    const institutionId = req.user?.institutionId;
    if (institutionId) {
      await Institution.findByIdAndUpdate(institutionId, {
        $set: {
          'whatsappConnection.status': 'NOT_CONNECTED',
          'whatsappConnection.phone': null,
          'whatsappConnection.connectedAt': null
        }
      });
    }

    const baileys = getBaileysWhatsAppProvider();
    await baileys.disconnect();

    return res.status(200).json({
      success: true,
      data: { state: 'NOT_CONNECTED', message: 'WhatsApp session disconnected' }
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutWhatsApp(req: Request, res: Response, next: NextFunction) {
  try {
    mockConnectedState = false;
    const institutionId = req.user?.institutionId;
    if (institutionId) {
      await Institution.findByIdAndUpdate(institutionId, {
        $set: {
          'whatsappConnection.status': 'NOT_CONNECTED',
          'whatsappConnection.phone': null,
          'whatsappConnection.connectedAt': null
        }
      });
    }

    const baileys = getBaileysWhatsAppProvider();
    await baileys.logout();

    return res.status(200).json({
      success: true,
      data: { state: 'NOT_CONNECTED', message: 'WhatsApp session logged out and auth purged' }
    });
  } catch (error) {
    next(error);
  }
}
