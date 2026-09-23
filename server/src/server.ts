import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { logger } from './utils/logger';

import { initializeWorkers } from './workers';
import { globalJobQueue } from './workers/jobQueue';

import { getBaileysWhatsAppProvider } from './integrations/whatsapp/BaileysWhatsAppProvider';

async function startServer() {
  try {
    // 1. Connect to Database
    await connectDatabase();

    // 2. Initialize and Start Embedded Workers
    initializeWorkers();
    await globalJobQueue.start(2000);

    // 2b. Auto-reconnect Baileys session if credentials exist on disk (Rule 24 & Session Persistence)
    const baileys = getBaileysWhatsAppProvider();
    if (baileys.hasStoredSession()) {
      logger.info('BAILEYS_AUTO_RECONNECT', 'Stored WhatsApp session detected on disk. Attempting auto-reconnect...');
      baileys.initialize().catch((err) => logger.error('BAILEYS_AUTO_RECONNECT_ERROR', err.message));
    }

    // 3. Create Express App
    const app = createApp();

    // 4. Start Listening
    const server = app.listen(env.PORT, () => {
      logger.info('SERVER_STARTED', `AlphaXync server running on http://localhost:${env.PORT} in [${env.NODE_ENV}] mode`);
    });

    // Graceful Shutdown Handler (Rule 47)
    const shutdown = async (signal: string) => {
      logger.info('SERVER_SHUTDOWN_SIGNAL', `Received ${signal}. Closing gracefully...`);
      globalJobQueue.stop();
      try {
        await getBaileysWhatsAppProvider().disconnect();
      } catch (e) {}
      server.close(async () => {
        logger.info('SERVER_CLOSED', 'HTTP server closed.');
        await disconnectDatabase();
        process.exit(0);
      });

      // Force close after 10s if graceful shutdown fails
      setTimeout(() => {
        logger.error('SERVER_FORCED_SHUTDOWN', 'Could not close connections in time, forcing shutdown');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error: any) {
    logger.error('SERVER_FATAL_ERROR', `Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}
