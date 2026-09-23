import { Router } from 'express';
import { getMessages, getMessageDetail, retryMessage, sendTestMessage, getMessageStats } from './messageController';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', getMessages);
router.get('/stats', getMessageStats);
router.post('/test-send', requireRole(['ADMIN']), sendTestMessage);
router.get('/:id', getMessageDetail);
router.post('/:id/retry', retryMessage);

export const messageRoutes = router;

