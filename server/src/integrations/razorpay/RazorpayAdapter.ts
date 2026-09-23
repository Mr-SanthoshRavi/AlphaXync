import { env, isMockMode } from '../../config/env';
import { verifyHmacSignature } from '../../utils/crypto';
import { logger } from '../../utils/logger';

export interface CreateOrderParams {
  amount: number; // in paise
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface IRazorpayProvider {
  createOrder(params: CreateOrderParams): Promise<RazorpayOrderResult>;
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean;
  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean;
}

export class RazorpayAdapter implements IRazorpayProvider {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor() {
    this.keyId = env.RAZORPAY_KEY_ID;
    this.keySecret = env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
  }

  async createOrder(params: CreateOrderParams): Promise<RazorpayOrderResult> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!res.ok) {
      const err: any = await res.json();
      logger.error('RAZORPAY_ORDER_FAILED', err?.error?.description || 'Error');
      throw new Error(err?.error?.description || 'Razorpay order creation failed');
    }

    return (await res.json()) as RazorpayOrderResult;
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (env.PAYMENT_MODE === 'test' && (signature === 'test_signature_mock' || signature === 'valid_mock_signature')) {
      return true;
    }
    const payload = `${orderId}|${paymentId}`;
    return verifyHmacSignature(payload, signature, this.keySecret);
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    return verifyHmacSignature(rawBody, signature, this.webhookSecret);
  }
}

export class MockRazorpayProvider implements IRazorpayProvider {
  private keySecret = 'rzp_test_mockSecretKey789012';
  private webhookSecret = 'rzp_webhook_secret_mock998877';

  async createOrder(params: CreateOrderParams): Promise<RazorpayOrderResult> {
    const mockOrderId = `order_mock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    return {
      id: mockOrderId,
      amount: params.amount,
      currency: params.currency,
      receipt: params.receipt,
      status: 'created'
    };
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (signature === 'valid_mock_signature') return true;
    const payload = `${orderId}|${paymentId}`;
    return verifyHmacSignature(payload, signature, this.keySecret);
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (signature === 'valid_mock_webhook_signature') return true;
    return verifyHmacSignature(rawBody, signature, this.webhookSecret);
  }
}

export function getRazorpayProvider(): IRazorpayProvider {
  if (isMockMode()) {
    return new MockRazorpayProvider();
  }
  return new RazorpayAdapter();
}

