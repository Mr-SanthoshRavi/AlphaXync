import { Router } from 'express';
import { getDashboardSummary } from './dashboardController';
import { authenticate } from '../../middleware/auth';
import { addEventClient, removeEventClient } from '../events/eventStream';

const router = Router();

router.use(authenticate);

router.get('/summary', getDashboardSummary);

// SSE Live Stream Route
router.get('/live-stream', (req: any, res: any) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = `${req.user!.userId}_${Date.now()}`;
  addEventClient(clientId, res, req.user!.institutionId);

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Live stream connected' })}\n\n`);

  req.on('close', () => {
    removeEventClient(clientId);
  });
});

export const dashboardRoutes = router;
