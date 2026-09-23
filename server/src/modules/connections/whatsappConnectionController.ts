import { Request, Response, NextFunction } from 'express';
import { getBaileysWhatsAppProvider } from '../../integrations/whatsapp/BaileysWhatsAppProvider';
import { env, isMockMode } from '../../config/env';
import { logger } from '../../utils/logger';

export async function getWhatsAppStatus(req: Request, res: Response, next: NextFunction) {
  try {
    if (isMockMode()) {
      return res.status(200).json({
        success: true,
        data: {
          provider: 'mock',
          state: 'CONNECTED',
          statusText: 'CONNECTED ✓',
          qrCode: null,
          maskedPhone: '+91 ••••• 3210',
          lastError: null,
          hasStoredSession: true,
          minSendIntervalMs: env.MIN_SEND_INTERVAL_MS,
          concurrency: env.OUTBOUND_CONCURRENCY
        }
      });
    }

    const baileys = getBaileysWhatsAppProvider();
    const rawState = baileys.getConnectionState();
    const qrDataUrl = baileys.getQrDataUrl();
    const maskedPhone = baileys.getMaskedPhone();
    const lastError = baileys.getLastError();
    const hasStoredSession = baileys.hasStoredSession();

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
    if (isMockMode()) {
      return res.status(200).json({
        success: true,
        data: { state: 'CONNECTED', statusText: 'CONNECTED ✓', maskedPhone: '+91 ••••• 3210' }
      });
    }

    const baileys = getBaileysWhatsAppProvider();
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
        data: { state: 'CONNECTED', statusText: 'CONNECTED ✓' }
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
