import { Router } from 'express';
import { askChatbot } from './chatbotController';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Protect chatbot endpoint so only authenticated admins/staff can query
router.use(authenticate);

router.post('/ask', askChatbot);

export const chatbotRoutes = router;
