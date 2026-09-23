import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { rawBodySaver } from './middleware/rawBodySaver';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './modules/auth/authRoutes';
import { dashboardRoutes } from './modules/dashboard/dashboardRoutes';
import { studentRoutes } from './modules/students/studentRoutes';
import { feeRoutes } from './modules/fees/feeRoutes';
import { paymentRoutes } from './modules/payments/paymentRoutes';
import { publicPaymentRoutes } from './modules/payments/publicPaymentRoutes';
import { automationRoutes } from './modules/automations/automationRoutes';
import { messageRoutes } from './modules/messages/messageRoutes';
import { syncRoutes } from './modules/sync/syncRoutes';
import { settingsRoutes } from './modules/settings/settingsRoutes';
import { connectionRoutes } from './modules/connections/connectionRoutes';
import { chatbotRoutes } from './modules/chatbot/chatbotRoutes';
import { auditLogRoutes } from './modules/auditLog/auditLogRoutes';
import { whatsappWebhook } from './webhooks/whatsappWebhook';
import { razorpayWebhook } from './webhooks/razorpayWebhook';
import { env } from './config/env';

export function createApp() {
  const app = express();

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false
    })
  );

  // CORS Whitelist (Production Domain & Local Dev)
  const allowedOrigins = [
    'http://xync.alphaprime.co.in',
    'https://xync.alphaprime.co.in',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5173',
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          /\.vercel\.app$/.test(origin) ||
          env.NODE_ENV !== 'production'
        ) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true
    })
  );

  // Cookie parser
  app.use(cookieParser(env.SESSION_SECRET));

  // Body parsers with raw body saving for webhook verification
  app.use(express.json({ verify: rawBodySaver, limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, verify: rawBodySaver, limit: '10mb' }));

  // Static uploads directory for media flyers & invitations
  app.use('/uploads', express.static(require('path').join(process.cwd(), 'uploads')));

  // Health Endpoints
  app.get(['/health', '/api/health'], (req: Request, res: Response) => {
    const isDbConnected = mongoose.connection.readyState === 1;
    return res.status(200).json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: isDbConnected ? 'connected' : 'disconnected',
      paymentMode: env.PAYMENT_MODE,
      environment: env.NODE_ENV
    });
  });

  // Readiness Probe
  app.get('/ready', (req: Request, res: Response) => {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (isDbConnected) {
      return res.status(200).json({ ready: true });
    }
    return res.status(503).json({ ready: false, reason: 'Database not ready' });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/fees', feeRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/automations', automationRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/connections', connectionRoutes);
  app.use('/api/public/pay', publicPaymentRoutes);
  app.use('/api/chatbot', chatbotRoutes);
  app.use('/api/audit-logs', auditLogRoutes);

  // Webhooks
  app.use('/webhooks/whatsapp', whatsappWebhook);
  app.use('/webhooks/razorpay', razorpayWebhook);

  // Error Handler
  app.use(errorHandler);

  return app;
}
