import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

let mongoMemoryServerInstance: any = null;

export async function connectDatabase(): Promise<typeof mongoose> {
  // If already connected, return
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // Attempt direct connection first
  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 3000
    });
    logger.info('DATABASE_CONNECTED', `Connected to MongoDB at ${env.MONGODB_URI}`);
    return conn;
  } catch (error: any) {
    logger.warn('DATABASE_PRIMARY_FAILED', `Could not connect to ${env.MONGODB_URI}: ${error.message}. Checking in-memory fallback...`);
    
    // In development or test, fallback to MongoMemoryServer
    if (env.NODE_ENV !== 'production') {
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
