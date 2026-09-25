import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PaymentIntent } from '../../models/PaymentIntent';
import { Payment } from '../../models/Payment';
import { Student } from '../../models/Student';
import { FeeAccount } from '../../models/FeeAccount';
import { Institution } from '../../models/Institution';
import { getRazorpayProvider } from '../../integrations/razorpay/RazorpayAdapter';
import { handlePaymentSuccess } from './paymentSuccessHandler';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';

const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().optional(),
  razorpay_order_id: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  razorpay_payment_id: z.string().optional(),
  razorpaySignature: z.string().optional(),
  razorpay_signature: z.string().optional()
}).transform((data) => ({
  razorpayOrderId: (data.razorpayOrderId || data.razorpay_order_id || '') as string,
  razorpayPaymentId: (data.razorpayPaymentId || data.razorpay_payment_id || '') as string,
  razorpaySignature: (data.razorpaySignature || data.razorpay_signature || '') as string
}));

export async function getPaymentPage(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.params;

    const intent = await PaymentIntent.findOne({ paymentToken: token })
      .populate('studentId', 'name externalStudentId course department whatsappNumber')
      .populate('feeAccountId', 'feeType totalAmount balance')
      .populate('institutionId', 'name code logoUrl');

    if (!intent) {
      throw new AppError('INVALID_PAYMENT_LINK', 'This payment link does not exist or has expired.', 404);
    }

    if (intent.status === 'COMPLETED') {
      const student = intent.studentId as any;
      const inst = intent.institutionId as any;
      const fee = intent.feeAccountId as any;
      const payment = await Payment.findOne({ 
        institutionId: intent.institutionId,
        studentId: intent.studentId,
        feeAccountId: intent.feeAccountId,
        status: 'CAPTURED'
      }).sort({ createdAt: -1 });

      return res.status(200).json({
        success: true,
        data: {
          status: 'COMPLETED',
          message: 'This payment has been completed and verified.',
          receiptNumber: payment?.receiptNumber || 'REC-CONFIRMED',
          transactionId: payment?.providerPaymentId || payment?.reference,
          amount: payment?.amount || intent.amount,
          studentName: student?.name,
          registerNo: student?.externalStudentId,
          course: student?.course,
          department: student?.department || student?.rawSourceData?.Course || 'General',
          whatsappNumber: student?.whatsappNumber,
          institutionName: inst?.name,
          logoUrl: inst?.logoUrl,
          totalFee: fee?.totalAmount,
          balanceRemaining: fee?.balance !== undefined ? fee.balance : 0,
          date: payment?.createdAt || new Date()
        }
      });
    }

    if (intent.expiresAt < new Date()) {
      intent.status = 'EXPIRED';
      await intent.save();
      throw new AppError('PAYMENT_LINK_EXPIRED', 'This payment link has expired.', 410);
    }

    const student = intent.studentId as any;
    const fee = intent.feeAccountId as any;
    const inst = intent.institutionId as any;

    return res.status(200).json({
      success: true,
      data: {
        paymentToken: intent.paymentToken,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        studentName: student?.name,
        registerNo: student?.externalStudentId,
        course: student?.course,
        department: student?.department,
        whatsappNumber: student?.whatsappNumber,
        feeType: fee?.feeType,
        institutionName: inst?.name,
        logoUrl: inst?.logoUrl,
        expiresAt: intent.expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function createCheckoutOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.params;

    const intent = await PaymentIntent.findOne({ paymentToken: token, status: 'CREATED' });
    if (!intent) {
      throw new AppError('INTENT_NOT_FOUND', 'Payment intent not found or already completed', 404);
    }

    if (intent.expiresAt < new Date()) {
      intent.status = 'EXPIRED';
      await intent.save();
      throw new AppError('PAYMENT_EXPIRED', 'Payment intent has expired', 410);
    }

    const provider = getRazorpayProvider();

    const order = await provider.createOrder({
      amount: intent.amount * 100, // convert to paise
      currency: intent.currency,
      receipt: `RCP_${intent._id.toString().slice(-8)}`
    });

    intent.razorpayOrderId = order.id;
    await intent.save();

    return res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: intent.amount,
        currency: intent.currency,
        keyId: env.RAZORPAY_KEY_ID // Public Key only
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyPublicPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.params;
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = verifyPaymentSchema.parse(req.body);

    const intent = await PaymentIntent.findOne({ paymentToken: token, status: 'CREATED' })
      .populate('studentId')
      .populate('feeAccountId')
      .populate('institutionId');

    if (!intent) {
      throw new AppError('INTENT_NOT_FOUND', 'Payment intent not found or already completed', 404);
    }

    const provider = getRazorpayProvider();

    // 1. Signature Verification
    const isValid = provider.verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      throw new AppError('SIGNATURE_VERIFICATION_FAILED', 'Payment verification failed: Invalid HMAC signature', 400);
    }

    // 2. Atomic Success Handler
    const result = await handlePaymentSuccess({
      institutionId: (intent.institutionId as any)._id || intent.institutionId,
      studentId: (intent.studentId as any)._id || intent.studentId,
      feeAccountId: (intent.feeAccountId as any)._id || intent.feeAccountId,
      amount: intent.amount,
      providerPaymentId: razorpayPaymentId,
      providerOrderId: razorpayOrderId,
      method: 'RAZORPAY',
      paymentIntentId: intent._id
    });

    const student = intent.studentId as any;
    const inst = intent.institutionId as any;
    const fee = intent.feeAccountId as any;

    return res.status(200).json({
      success: true,
      data: {
        verified: true,
        receiptNumber: result.receipt.receiptNumber,
        amount: intent.amount,
        transactionId: razorpayPaymentId,
        studentName: student?.name,
        registerNo: student?.externalStudentId,
        course: student?.course,
        department: student?.department || student?.rawSourceData?.Course || 'General',
        whatsappNumber: student?.whatsappNumber,
        balanceRemaining: result.feeAccount?.balance !== undefined ? result.feeAccount.balance : fee?.balance,
        totalFee: fee?.totalAmount,
        institutionName: inst?.name,
        logoUrl: inst?.logoUrl,
        date: new Date(),
        message: 'Payment verified and captured successfully'
      }
    });
  } catch (error) {
    next(error);
  }
}
