import mongoose from 'mongoose';
import { createApp } from '../server/src/app';
import { connectDatabase } from '../server/src/config/database';

let appInstance: any = null;

function getApp() {
  if (!appInstance) {
    appInstance = createApp();
  }
  return appInstance;
}

export default async function handler(req: any, res: any) {
  // Add CORS headers early to ensure browser receives JSON on errors
  const origin = req.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const app = getApp();
  const url = req.url || '';

  // 1. Ensure database connection is active (cached across warm lambda invocations)
  if (mongoose.connection.readyState !== 1) {
    try {
      await connectDatabase();
    } catch (dbErr: any) {
      console.warn('Vercel Serverless: DB connection warning:', dbErr?.message);

      // Routes that do NOT require database connection to operate
      const isDbExempt =
        url === '/health' ||
        url.startsWith('/health') ||
        url.includes('/api/health') ||
        url.includes('/captcha') ||
        url.includes('/api/auth/captcha');

      if (!isDbExempt) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Database connection failed. Please ensure MONGODB_URI is set in Vercel Environment Variables and MongoDB Atlas allows 0.0.0.0/0 IP access.',
            details: dbErr?.message
          }
        });
      }
    }
  }

  // 2. Forward request to Express app and ensure lambda waits for response completion
  return new Promise<void>((resolve, reject) => {
    res.on('finish', () => resolve());
    res.on('close', () => resolve());
    res.on('error', (err: any) => reject(err));

    try {
      app(req, res, (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  }).catch((err: any) => {
    console.error('VERCEL_SERVERLESS_RUNTIME_ERROR:', err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVERLESS_FUNCTION_ERROR',
          message: err?.message || 'Internal serverless runtime exception'
        }
      });
    }
  });
}
