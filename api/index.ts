import mongoose from 'mongoose';
import { createApp } from '../server/src/app';
import { connectDatabase } from '../server/src/config/database';

let appInstance: any = null;

export default async function handler(req: any, res: any) {
  try {
    // 1. Initialize Express application singleton
    if (!appInstance) {
      appInstance = createApp();
    }

    // 2. Ensure database connection is active (cached across warm lambda invocations)
    if (mongoose.connection.readyState !== 1) {
      try {
        await connectDatabase();
      } catch (dbErr: any) {
        console.warn('Vercel Serverless: DB connection warning:', dbErr.message);
        const url = req.url || '';
        // If it's a health or status check, allow Express to respond directly
        if (url === '/health' || url.startsWith('/health') || url === '/api/health') {
          return appInstance(req, res);
        }
        return res.status(503).json({
          success: false,
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Database connection failed. Please ensure MONGODB_URI is configured in Vercel environment variables and MongoDB Atlas allows 0.0.0.0/0 IP access.',
            details: dbErr.message
          }
        });
      }
    }

    // 3. Forward request to Express app
    return appInstance(req, res);
  } catch (err: any) {
    console.error('VERCEL_SERVERLESS_ERROR:', err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVERLESS_FUNCTION_ERROR',
        message: err.message || 'Internal serverless runtime exception'
      }
    });
  }
}
