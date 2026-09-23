import { createApp } from '../server/src/app';
import { connectDatabase } from '../server/src/config/database';

let appInstance: any = null;

export default async function handler(req: any, res: any) {
  try {
    // 1. Ensure database connection is active (cached across warm lambda invocations)
    await connectDatabase();

    // 2. Initialize Express application singleton
    if (!appInstance) {
      appInstance = createApp();
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
