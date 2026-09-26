import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Institution } from '../../models/Institution';
import { User } from '../../models/User';
import { DataConnection } from '../../models/DataConnection';
import { env, isMockMode } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

function maskKey(key?: string): string {
  if (!key) return '••••••••';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = req.user?.institutionId ? new Types.ObjectId(req.user.institutionId) : null;
    let institution = institutionId ? await Institution.findById(institutionId) : null;

    if (!institution) {
      const cleanName = req.user?.email ? req.user.email.split('@')[0] : 'Campus';
      const codePrefix = cleanName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'CAMPUS';
      const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
      institution = await Institution.create({
        name: `${cleanName}'s Campus`,
        code: `${codePrefix}_${randomHex}`,
        timezone: 'Asia/Kolkata',
        active: true
      });
      if (req.user?.userId) {
        await User.findByIdAndUpdate(req.user.userId, { institutionId: institution._id });
      }
    }

    // Masked security connection states
    // WhatsApp provider status
    const { getBaileysWhatsAppProvider } = await import('../../integrations/whatsapp/BaileysWhatsAppProvider');
    const baileys = getBaileysWhatsAppProvider();
    const waState = baileys.getConnectionState();
    let waStatus = 'Disconnected';
    let waConnected = false;

    if (isMockMode()) {
      waStatus = 'Mock Sandbox Active';
      waConnected = true;
    } else if (waState === 'CONNECTED') {
      waStatus = 'WhatsApp Connected ✓';
      waConnected = true;
    } else if (waState === 'AUTH_REQUIRED') {
      waStatus = 'WhatsApp Reconnect required / QR scan required';
    } else if (waState === 'CONNECTING' || waState === 'RECONNECTING') {
      waStatus = 'WhatsApp Connecting...';
    } else {
      waStatus = 'WhatsApp Reconnect required';
    }

    return res.status(200).json({
      success: true,
      data: {
        institution: {
          id: institution._id,
          name: institution.name,
          code: institution.code,
          timezone: institution.timezone,
          defaultCountryCode: institution.defaultCountryCode,
          logoUrl: institution.logoUrl,
          receiptSettings: institution.receiptSettings
        },
        connections: {
          razorpay: {
            connected: !!env.RAZORPAY_KEY_ID,
            mode: env.PAYMENT_MODE,
            keyIdMasked: maskKey(env.RAZORPAY_KEY_ID),
            status: isMockMode() ? 'Mock Sandbox Mode' : (env.PAYMENT_MODE === 'test' ? 'Active (Razorpay Test Mode)' : 'Active (Live)')
          },
          whatsapp: {
            connected: waConnected,
            provider: env.WHATSAPP_PROVIDER,
            state: waState,
            phoneNumberMasked: 'WhatsApp Web Session',
            status: waStatus
          },
          googleSheets: await (async () => {
            const gConn = await DataConnection.findOne({ institutionId: institution._id, provider: 'google_sheets' });
            const isConn = isMockMode() || (gConn && gConn.status === 'CONNECTED');
            let statusText = 'OAuth Connection Required';
            if (isMockMode()) {
              statusText = 'Mock Sandbox Mode';
            } else if (gConn?.status === 'CONNECTED') {
              statusText = `Connected (${gConn.accountReference || 'Google Workspace'}) ✓`;
            } else if (gConn?.status === 'ERROR') {
              statusText = `Sync Error: ${gConn.syncStatus || 'Please reconnect'}`;
            } else if (process.env.GOOGLE_SHEETS_ACCESS_TOKEN) {
              statusText = 'Connected via Env Token ✓';
            }
            return {
              connected: isConn,
              status: statusText,
              source: gConn?.sheetReference || 'Students_Master'
            };
          })(),
          ai: {
            enabled: env.AI_ENABLED,
            status: env.AI_ENABLED ? 'Active' : 'Disabled (Optional)'
          }
        },
        mockMode: isMockMode()
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function updateInstitution(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = req.user?.institutionId ? new Types.ObjectId(req.user.institutionId) : null;
    const { name, timezone, logoUrl, receiptSettings } = req.body;

    let institution = institutionId ? await Institution.findById(institutionId) : null;

    if (!institution) {
      const cleanName = req.user?.email ? req.user.email.split('@')[0] : 'Campus';
      const codePrefix = cleanName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'CAMPUS';
      const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
      institution = await Institution.create({
        name: name || `${cleanName}'s Campus`,
        code: `${codePrefix}_${randomHex}`,
        timezone: timezone || 'Asia/Kolkata',
        active: true
      });
      if (req.user?.userId) {
        await User.findByIdAndUpdate(req.user.userId, { institutionId: institution._id });
      }
    }

    if (name) institution.name = name;
    if (timezone) institution.timezone = timezone;
    if (logoUrl !== undefined) institution.logoUrl = logoUrl;
    if (receiptSettings !== undefined) {
      institution.receiptSettings = {
        ...(institution.receiptSettings ? (institution.receiptSettings as any).toObject?.() || institution.receiptSettings : {}),
        ...receiptSettings
      };
      institution.markModified('receiptSettings');
    }
    await institution.save();

    return res.status(200).json({
      success: true,
      data: {
        id: institution._id,
        name: institution.name,
        code: institution.code,
        timezone: institution.timezone,
        logoUrl: institution.logoUrl,
        receiptSettings: institution.receiptSettings
      }
    });
  } catch (error) {
    next(error);
  }
}
