import { Types } from 'mongoose';
import { Payment } from '../../models/Payment';
import { FeeAccount } from '../../models/FeeAccount';
import { Student } from '../../models/Student';
import { PaymentIntent } from '../../models/PaymentIntent';
import { Receipt } from '../../models/Receipt';
import { Job } from '../../models/Job';
import { Message } from '../../models/Message';
import { AuditLog } from '../../models/AuditLog';
import { broadcastEvent } from '../events/eventStream';
import { logger } from '../../utils/logger';
import { generateSecureToken } from '../../utils/crypto';

export interface PaymentSuccessParams {
  institutionId: Types.ObjectId;
  studentId: Types.ObjectId;
  feeAccountId: Types.ObjectId;
  amount: number;
  providerPaymentId: string;
  providerOrderId: string;
  method?: 'RAZORPAY' | 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'OFFLINE' | 'UPI';
  paymentIntentId?: Types.ObjectId;
}

export async function handlePaymentSuccess(params: PaymentSuccessParams): Promise<any> {
  const {
    institutionId,
    studentId,
    feeAccountId,
    amount,
    providerPaymentId,
    providerOrderId,
    method = 'RAZORPAY',
    paymentIntentId
  } = params;

  // 1. Idempotency Check: check if payment already captured with this providerPaymentId
  let payment = await Payment.findOne({ institutionId, providerPaymentId });
  if (payment && payment.status === 'CAPTURED') {
    logger.info('PAYMENT_ALREADY_CAPTURED_IDEMPOTENT', `Payment ${providerPaymentId} already processed.`);
    return payment;
  }

  const feeAccount = await FeeAccount.findOne({ _id: feeAccountId, institutionId });
  if (!feeAccount) {
    throw new Error(`FeeAccount ${feeAccountId} not found`);
  }

  const student = await Student.findOne({ _id: studentId, institutionId });
  if (!student) {
    throw new Error(`Student ${studentId} not found`);
  }

  const year = new Date().getFullYear();
  const count = await Receipt.countDocuments();
  const receiptNumber = `REC-${year}-${String(count + 1).padStart(6, '0')}`;

  // 2. Create or Update Payment to CAPTURED
  if (!payment) {
    payment = await Payment.create({
      institutionId,
      studentId,
      feeAccountId,
      amount,
      currency: 'INR',
      method,
      provider: 'RAZORPAY',
      providerOrderId,
      providerPaymentId,
      status: 'CAPTURED',
      verifiedAt: new Date(),
      reference: providerPaymentId,
      receiptNumber
    });
  } else {
    payment.status = 'CAPTURED';
    payment.verifiedAt = new Date();
    payment.receiptNumber = receiptNumber;
    await payment.save();
  }

  // 3. Server-side Recalculation
  const oldPaid = feeAccount.paidAmount;
  feeAccount.paidAmount += amount;
  feeAccount.balance = Math.max(0, feeAccount.totalAmount - feeAccount.paidAmount);
  feeAccount.status = feeAccount.balance === 0 ? 'PAID' : 'PARTIAL';
  await feeAccount.save();

  // 4. Update PaymentIntent if present
  if (paymentIntentId) {
    await PaymentIntent.findByIdAndUpdate(paymentIntentId, {
      status: 'COMPLETED'
    });
  }

  // 5. Create Receipt
  const receipt = await Receipt.create({
    receiptNumber,
    institutionId,
    studentId,
    paymentId: payment._id,
    amount,
    paymentDate: new Date(),
    transactionReference: providerPaymentId
  });

  // 6. Queue Sheet Write-Back Job (Rule 9: retryable, never causes payment to fail)
  await Job.create({
    type: 'SHEET_WRITE_BACK',
    payload: {
      institutionId: institutionId.toString(),
      studentId: student._id.toString(),
      feeAccountId: feeAccount._id.toString(),
      paymentId: payment._id.toString(),
      receiptNumber,
      paidAmount: feeAccount.paidAmount,
      balance: feeAccount.balance,
      status: feeAccount.status
    },
    status: 'QUEUED',
    runAt: new Date()
  });

  // 7. Auto-cancel future reminder jobs if paid (Rule 10, 13, 64)
  if (feeAccount.balance === 0) {
    await Job.updateMany(
      {
        type: 'MESSAGE',
        'payload.studentId': student._id.toString(),
        'payload.eventType': { $regex: /^FEE_REMINDER/ },
        status: { $in: ['QUEUED', 'WAITING'] }
      },
      { status: 'CANCELLED', lastError: 'PAYMENT_RECEIVED' }
    );

    // Also cancel in Message log
    await Message.updateMany(
      {
        institutionId,
        studentId: student._id,
        messageType: { $regex: /^FEE_REMINDER/ },
        status: { $in: ['QUEUED', 'WAITING'] }
      },
      { status: 'CANCELLED', failureReason: 'PAYMENT_RECEIVED' }
    );

    logger.info('FEE_REMINDERS_AUTO_CANCELLED', `Cancelled pending fee reminders for paid student ${student.name}`);
  }

  // 8. Queue WhatsApp Receipt Delivery with Payment Mode Identification & Next Payment Link
  if (student.whatsappNumber) {
    const idempotencyKey = `receipt_${institutionId}_${student._id}_${receiptNumber}`;

    const modeBadge = 
      method === 'UPI' ? '📱 UPI (GPay / PhonePe / Paytm)' :
      method === 'CASH' ? '🏢 On-Spot Counter Cash' :
      method === 'BANK_TRANSFER' ? '🏦 Bank Transfer (NEFT/RTGS)' :
      method === 'CHEQUE' ? '📄 Cheque / DD' :
      method === 'RAZORPAY' ? '🌐 Online Payment (Razorpay / UPI)' : '💳 Card / Terminal';

    const courseDept = (student as any).rawSourceData?.Course || student.department || 'General';
    const formattedDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    let nextPaymentUrl = '';
    let upiDirectUrl = '';
    if (feeAccount.balance > 0) {
      const paymentToken = generateSecureToken(32);
      const expiresAt = new Date(Date.now() + 72 * 3600 * 1000);
      await PaymentIntent.create({
        institutionId,
        studentId: student._id,
        feeAccountId: feeAccount._id,
        amount: feeAccount.balance,
        currency: 'INR',
        status: 'CREATED',
        paymentToken,
        expiresAt
      });
      const clientBaseUrl = (process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? 'https://xync.alphaprime.co.in' : 'http://localhost:5173')).replace(/\/+$/, '');
      nextPaymentUrl = `${clientBaseUrl}/pay/${paymentToken}`;
      upiDirectUrl = `upi://pay?pa=alphaxync@upi&pn=AlphaXync&am=${feeAccount.balance}&cu=INR&tn=${student.externalStudentId}_BAL`;
    }

    let receiptBody = '';
    if (feeAccount.balance > 0) {
      receiptBody = `🏛️ *ALPHAXYNC ACADEMIC OPERATIONS*
📄 *OFFICIAL FEE PAYMENT RECEIPT*
━━━━━━━━━━━━━━━━━━━━
[🏷️ Payment Mode: ${modeBadge}]

👤 *Student Name:* ${student.name}
🆔 *Register No:* ${student.externalStudentId}
🎓 *Course / Dept:* ${courseDept}
🧾 *Receipt No:* ${receiptNumber}
📅 *Date:* ${formattedDate}
💳 *Transaction Ref:* ${providerPaymentId}
━━━━━━━━━━━━━━━━━━━━
💰 *Amount Paid:* ₹${amount.toLocaleString('en-IN')}
⚠️ *Status: PARTIAL PAYMENT RECEIVED*
⏳ *Remaining Balance Due:* ₹${feeAccount.balance.toLocaleString('en-IN')}

📲 *Settle Remaining Balance Online:*
🔗 Payment Link: ${nextPaymentUrl}
⚡ Direct UPI Pay: ${upiDirectUrl}

_Please retain this digital receipt for institutional records._`;
    } else {
      receiptBody = `🏛️ *ALPHAXYNC ACADEMIC OPERATIONS*
📄 *OFFICIAL FEE PAYMENT RECEIPT*
━━━━━━━━━━━━━━━━━━━━
[🏷️ Payment Mode: ${modeBadge}]

👤 *Student Name:* ${student.name}
🆔 *Register No:* ${student.externalStudentId}
🎓 *Course / Dept:* ${courseDept}
🧾 *Receipt No:* ${receiptNumber}
📅 *Date:* ${formattedDate}
💳 *Transaction Ref:* ${providerPaymentId}
━━━━━━━━━━━━━━━━━━━━
💰 *Amount Paid:* ₹${amount.toLocaleString('en-IN')}
✅ *Status: FULLY SETTLED / NIL DUES*
🎉 *Remaining Balance:* ₹0

🏆 *Official Clearance:* Your institutional fee account is completely cleared. No pending dues remain.

_Official digital acknowledgment verified by AlphaXync Finance Desk._`;
    }

    await Job.create({
      type: 'MESSAGE',
      payload: {
        institutionId: institutionId.toString(),
        studentId: student._id.toString(),
        recipient: student.whatsappNumber,
        templateName: 'payment_receipt',
        eventType: 'RECEIPT',
        eventReference: receiptNumber,
        body: receiptBody,
        variables: {
          student_name: student.name,
          amount: String(amount),
          receipt_number: receiptNumber,
          transaction_id: providerPaymentId
        },
        idempotencyKey,
        source: 'AUTOMATION'
      },
      status: 'QUEUED',
      runAt: new Date()
    });
  }

  // 8b. Dispatch active AFTER_PAYMENT custom automation campaigns
  try {
    const { evaluateAfterPaymentAutomations } = await import('../../workers/automationWorker');
    await evaluateAfterPaymentAutomations({
      institutionId,
      studentId: student._id,
      feeAccountId: feeAccount._id,
      paymentId: payment._id,
      amount,
      receiptNumber
    });
  } catch (afterPayErr: any) {
    logger.warn('AFTER_PAYMENT_AUTOMATION_WARN', `Error running after-payment automations: ${afterPayErr.message}`);
  }

  // 9. Audit Log
  await AuditLog.create({
    institutionId,
    action: 'PAYMENT_CAPTURED_VERIFIED',
    entityType: 'PAYMENT',
    entityId: payment._id.toString(),
    before: { paidAmount: oldPaid },
    after: { paidAmount: feeAccount.paidAmount, amount, receiptNumber, providerPaymentId },
    reason: 'Verified online transaction captured'
  });

  // 10. Broadcast Live State Update
  broadcastEvent(institutionId.toString(), 'PAYMENT_CAPTURED', {
    studentName: student.name,
    amount,
    receiptNumber,
    providerPaymentId
  });

  logger.info('PAYMENT_SUCCESS_HANDLED', `Successfully verified and captured payment ₹${amount} for ${student.name} (${receiptNumber})`);

  return {
    payment,
    receipt,
    feeAccount
  };
}
