import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

let mongoMemoryServerInstance: any = null;

export async function connectDatabase(): Promise<typeof mongoose> {
  // If already connected, return
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const resolvedUri = (
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL ||
    process.env.MONGODB_URL ||
    process.env.mongodb_uri ||
    env.MONGODB_URI ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
  if (isServerless && (!resolvedUri || resolvedUri.includes('localhost') || resolvedUri.includes('127.0.0.1'))) {
    throw new Error('MONGODB_URI environment variable is missing in Vercel Settings (currently pointing to localhost). Please configure your MongoDB Atlas URI in Vercel Settings -> Environment Variables and click Redeploy.');
  }

  // Attempt direct connection first
  try {
    const conn = await mongoose.connect(resolvedUri, {
      serverSelectionTimeoutMS: 8000
    });
    logger.info('DATABASE_CONNECTED', `Connected to MongoDB at ${resolvedUri.split('@')[1] || resolvedUri}`);
    return conn;
  } catch (error: any) {
    logger.warn('DATABASE_PRIMARY_FAILED', `Could not connect to ${env.MONGODB_URI}: ${error.message}. Checking in-memory fallback...`);
    
    const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
    // In local development or test (and NOT in serverless lambda), fallback to MongoMemoryServer
    if (env.NODE_ENV !== 'production' && !isServerless) {
      try {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        mongoMemoryServerInstance = await MongoMemoryServer.create();
        const memoryUri = mongoMemoryServerInstance.getUri();
        const conn = await mongoose.connect(memoryUri);
        logger.info('DATABASE_MEMORY_SERVER_STARTED', `Started and connected to in-memory MongoDB at ${memoryUri}`);
        return conn;
      } catch (memErr: any) {
        logger.error('DATABASE_MEMORY_SERVER_FAILED', `Failed to start MongoMemoryServer: ${memErr.message}`);
        throw memErr;
      }
    } else {
      logger.error('DATABASE_CONNECTION_FATAL', 'MongoDB connection failed in production mode');
      throw error;
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('DATABASE_DISCONNECTED', 'Mongoose disconnected');
  }
  if (mongoMemoryServerInstance) {
    await mongoMemoryServerInstance.stop();
    mongoMemoryServerInstance = null;
    logger.info('DATABASE_MEMORY_SERVER_STOPPED', 'MongoMemoryServer stopped');
  }
}
