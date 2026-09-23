import { Router, Request, Response } from 'express';
import { RequestWithRawBody } from '../middleware/rawBodySaver';
import { getRazorpayProvider } from '../integrations/razorpay/RazorpayAdapter';
import { handlePaymentSuccess } from '../modules/payments/paymentSuccessHandler';
import { PaymentIntent } from '../models/PaymentIntent';
import { Payment } from '../models/Payment';
import { logger } from '../utils/logger';

const router = Router();

router.post('/', async (req: RequestWithRawBody, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    if (!signature) {
      logger.warn('RAZORPAY_WEBHOOK_NO_SIG', 'Webhook received without x-razorpay-signature header');
      return res.status(400).json({ error: 'Signature header missing' });
    }

    const provider = getRazorpayProvider();

    // 1. Signature Verification using Raw Request Body
    const rawPayload = req.rawBody || JSON.stringify(req.body);
    const isValid = provider.verifyWebhookSignature(rawPayload, signature);

    if (!isValid) {
      logger.error('RAZORPAY_WEBHOOK_INVALID_SIG', 'Razorpay webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const paymentEntity = req.body.payload?.payment?.entity;

    if (!paymentEntity) {
      return res.status(200).json({ status: 'ignored_no_payment' });
    }

    const providerPaymentId = paymentEntity.id;
    const providerOrderId = paymentEntity.order_id;
    const amountInRupees = paymentEntity.amount / 100;

    // 2. Webhook Idempotency Check (Rule 84)
    const existing = await Payment.findOne({ providerPaymentId });
    if (existing && existing.status === 'CAPTURED') {
      logger.info('RAZORPAY_WEBHOOK_DUPLICATE_IGNORED', `Payment ${providerPaymentId} already processed`);
      return res.status(200).json({ status: 'already_processed' });
    }

    if (event === 'payment.captured') {
      // Find matching PaymentIntent
      const intent = await PaymentIntent.findOne({ razorpayOrderId: providerOrderId });
      if (!intent) {
        logger.warn('RAZORPAY_WEBHOOK_UNKNOWN_ORDER', `No matching intent for order ${providerOrderId}`);
        return res.status(200).json({ status: 'order_not_found_locally' });
      }

      // Verify amount (Rule 21: Amount Verification)
      if (amountInRupees !== intent.amount) {
        logger.error('PAYMENT_AMOUNT_MISMATCH', `Received ₹${amountInRupees} but expected ₹${intent.amount}`);
        return res.status(400).json({ error: 'Amount mismatch detected' });
      }

      await handlePaymentSuccess({
        institutionId: intent.institutionId,
        studentId: intent.studentId,
        feeAccountId: intent.feeAccountId,
        amount: amountInRupees,
        providerPaymentId,
        providerOrderId,
        method: 'RAZORPAY',
        paymentIntentId: intent._id
      });
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error: any) {
    logger.error('RAZORPAY_WEBHOOK_EXCEPTION', error.message);
    return res.status(500).json({ error: 'Webhook processing error' });
  }
});

export const razorpayWebhook = router;
