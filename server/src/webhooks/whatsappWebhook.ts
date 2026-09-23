import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { Message } from '../models/Message';
import { Student } from '../models/Student';
import { Ticket } from '../models/Ticket';
import { normalizePhoneNumber } from '../modules/sync/validationEngine';
import { broadcastEvent } from '../modules/events/eventStream';
import { logger } from '../utils/logger';

const router = Router();

// 1. WhatsApp Webhook Verification Endpoint (Meta Subscription)
router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WHATSAPP_WEBHOOK_VERIFIED', 'WhatsApp Cloud API subscription challenge verified');
    return res.status(200).send(challenge);
  }

  logger.warn('WHATSAPP_WEBHOOK_UNAUTHORIZED', 'Invalid verify token in WhatsApp webhook challenge');
  return res.status(403).json({ error: 'Verification failed' });
});

// 2. WhatsApp Event Webhook (Statuses & Inbound Messages)
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account' && !body.entry) {
      return res.status(200).json({ status: 'ignored' });
    }

    const entries = body.entry || [];

    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const val = change.value;
        if (!val) continue;

        // A. Handle Status Updates (sent, delivered, read, failed)
        if (val.statuses && Array.isArray(val.statuses)) {
          for (const statusObj of val.statuses) {
            const providerMessageId = statusObj.id;
            const newStatus = statusObj.status; // 'sent' | 'delivered' | 'read' | 'failed'
            const timestamp = statusObj.timestamp ? new Date(Number(statusObj.timestamp) * 1000) : new Date();

            const message = await Message.findOne({ providerMessageId });
            if (message) {
              if (newStatus === 'delivered') {
                message.status = 'DELIVERED';
                message.deliveredAt = timestamp;
              } else if (newStatus === 'read') {
                message.status = 'READ';
                message.readAt = timestamp;
              } else if (newStatus === 'failed') {
                message.status = 'FAILED';
                message.failedAt = timestamp;
                message.failureReason = statusObj.errors ? statusObj.errors[0]?.title : 'Delivery failed';
              }
              await message.save();

              logger.info('WHATSAPP_STATUS_UPDATED', `Message ${providerMessageId} status -> ${newStatus}`);
            }
          }
        }

        // B. Handle Inbound WhatsApp Messages (Complaints / Help Queries)
        if (val.messages && Array.isArray(val.messages)) {
          for (const msgObj of val.messages) {
            const rawFrom = msgObj.from; // e.g. 919876543210
            const normalizedPhone = normalizePhoneNumber(rawFrom);
            const textBody = msgObj.text?.body || msgObj.button?.text || 'Inbound communication';

            if (normalizedPhone) {
              const student = await Student.findOne({ whatsappNumber: normalizedPhone });
              const institutionId = student ? student.institutionId : undefined;

              if (institutionId) {
                const ticket = await Ticket.create({
                  institutionId,
                  studentId: student?._id,
                  phone: normalizedPhone,
                  senderName: student ? student.name : 'Unknown Parent/Student',
                  subject: 'Inbound WhatsApp Inquiry',
                  message: textBody,
                  receivedAt: new Date(),
                  status: 'OPEN',
                  priority: 'MEDIUM'
                });

                broadcastEvent(institutionId.toString(), 'NEW_HELP_TICKET', {
                  ticketId: ticket._id,
                  sender: student ? student.name : normalizedPhone,
                  message: textBody
                });

                logger.info('INBOUND_TICKET_CREATED', `Created Helpdesk ticket for ${normalizedPhone} (#${ticket._id})`);
              }
            }
          }
        }
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error: any) {
    logger.error('WHATSAPP_WEBHOOK_ERROR', error.message);
    // Always return 200 to Meta to avoid retry storms
    return res.status(200).json({ status: 'error_handled' });
  }
});

export const whatsappWebhook = router;
