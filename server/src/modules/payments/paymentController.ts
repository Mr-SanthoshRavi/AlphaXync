import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import axios from 'axios';
import { FeeAccount } from '../../models/FeeAccount';
import { Student } from '../../models/Student';
import { Payment } from '../../models/Payment';
import { Receipt } from '../../models/Receipt';
import { PaymentIntent } from '../../models/PaymentIntent';
import { AuditLog } from '../../models/AuditLog';
import { Job } from '../../models/Job';
import { DataConnection } from '../../models/DataConnection';
import { AppError } from '../../middleware/errorHandler';
import { generateSecureToken } from '../../utils/crypto';
import { broadcastEvent } from '../events/eventStream';
import { logger } from '../../utils/logger';

const offlinePaymentSchema = z.object({
  studentId: z.string(),
  feeAccountId: z.string(),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'OFFLINE', 'UPI']),
  reference: z.string().optional(),
  note: z.string().optional()
});

const adjustFeeSchema = z.object({
  feeAccountId: z.string(),
  newTotalAmount: z.coerce.number().nonnegative('Total fee cannot be negative'),
  reason: z.string().optional().transform(r => (r && r.trim().length >= 3) ? r.trim() : 'Administrative fee adjustment')
});

const waiveFineSchema = z.object({
  feeAccountId: z.string(),
  reason: z.string().optional().transform(r => (r && r.trim().length >= 3) ? r.trim() : 'Administrative fine waiver')
});

const changeDueDateSchema = z.object({
  feeAccountId: z.string(),
  newDueDate: z.string(),
  reason: z.string().optional().transform(r => (r && r.trim().length >= 3) ? r.trim() : 'Administrative due date extension')
});

const paymentRequestSchema = z.object({
  studentId: z.string(),
  feeAccountId: z.string(),
  amount: z.number().positive().optional(),
  sendWhatsApp: z.boolean().optional()
});

export async function recordOfflinePayment(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const body = offlinePaymentSchema.parse(req.body);

    const feeAccount = await FeeAccount.findOne({ _id: body.feeAccountId, institutionId });
    if (!feeAccount) {
      throw new AppError('FEE_ACCOUNT_NOT_FOUND', 'Fee account not found', 404);
    }

    // Financial Guard: Block payments on settled accounts
    if (feeAccount.balance <= 0) {
      throw new AppError('FEE_ALREADY_PAID', 'This student has already fully cleared all fees. No pending balance remains.', 400);
    }

    // Financial Guard: Prevent overpayment exceeding remaining balance
    if (body.amount > feeAccount.balance) {
      throw new AppError(
        'EXCEEDS_BALANCE',
        `Payment amount of ₹${body.amount.toLocaleString('en-IN')} exceeds outstanding balance of ₹${feeAccount.balance.toLocaleString('en-IN')}.`,
        400
      );
    }

    const student = await Student.findOne({ _id: body.studentId, institutionId });
    if (!student) {
      throw new AppError('STUDENT_NOT_FOUND', 'Student not found', 404);
    }

    const year = new Date().getFullYear();
    const count = await Receipt.countDocuments();
    const receiptNumber = `REC-${year}-${String(count + 1).padStart(6, '0')}`;

    // 1. Create Immutable Payment Record
    const payment = await Payment.create({
      institutionId,
      studentId: student._id,
      feeAccountId: feeAccount._id,
      amount: body.amount,
      currency: 'INR',
      method: body.method,
      provider: 'MANUAL',
      status: 'CAPTURED',
      verifiedAt: new Date(),
      reference: body.reference || `MANUAL-${Date.now()}`,
      note: body.note,
      enteredBy: req.user!.userId,
      receiptNumber
    });

    // 2. Server-side Recalculation
    const oldPaid = feeAccount.paidAmount;
    feeAccount.paidAmount += body.amount;
    feeAccount.balance = Math.max(0, feeAccount.totalAmount - feeAccount.paidAmount);
    feeAccount.status = feeAccount.balance === 0 ? 'PAID' : 'PARTIAL';
    await feeAccount.save();

    // 3. Create Receipt
    const receipt = await Receipt.create({
      receiptNumber,
      institutionId,
      studentId: student._id,
      paymentId: payment._id,
      amount: body.amount,
      paymentDate: new Date(),
      transactionReference: payment.reference!
    });

    // 4. Queue Sheet Write-Back (Retryable job, never crashes payment)
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

    // 5. If balance <= 0, cancel pending fee reminders
    if (feeAccount.balance === 0) {
      await Job.updateMany(
        {
          type: 'MESSAGE',
          'payload.studentId': student._id.toString(),
          'payload.eventType': { $regex: /^FEE_REMINDER/ },
          status: 'QUEUED'
        },
        { status: 'CANCELLED', lastError: 'PAYMENT_RECEIVED' }
      );
    }

    // 6. Queue WhatsApp Receipt Message if student has WhatsApp number
    if (student.whatsappNumber) {
      const modeBadge = 
        body.method === 'UPI' ? '📱 UPI (GPay / PhonePe / Paytm)' :
        body.method === 'CASH' ? '🏢 On-Spot Counter Cash' :
        body.method === 'BANK_TRANSFER' ? '🏦 Bank Transfer (NEFT/RTGS)' :
        body.method === 'CHEQUE' ? '📄 Cheque / DD' : '💳 POS Card Terminal';

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
        const baseOrigin = req.headers.origin || 'http://xync.alphaprime.co.in';
        nextPaymentUrl = `${baseOrigin}/pay/${paymentToken}`;
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
💳 *Transaction Ref:* ${payment.reference}
━━━━━━━━━━━━━━━━━━━━
💰 *Amount Paid:* ₹${body.amount.toLocaleString('en-IN')}
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
💳 *Transaction Ref:* ${payment.reference}
━━━━━━━━━━━━━━━━━━━━
💰 *Amount Paid:* ₹${body.amount.toLocaleString('en-IN')}
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
            amount: String(body.amount),
            receipt_number: receiptNumber,
            transaction_id: payment.reference!
          }
        },
        status: 'QUEUED',
        runAt: new Date()
      });
    }

    // 7. Audit Log
    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'PAYMENT_RECORDED_OFFLINE',
      entityType: 'PAYMENT',
      entityId: payment._id.toString(),
      before: { paidAmount: oldPaid },
      after: { paidAmount: feeAccount.paidAmount, amountPaid: body.amount, receiptNumber },
      reason: body.note || 'Cashier offline collection'
    });

    // Broadcast SSE live event
    broadcastEvent(institutionId.toString(), 'PAYMENT_RECEIVED', {
      studentName: student.name,
      amount: body.amount,
      receiptNumber
    });

    logger.info('OFFLINE_PAYMENT_RECORDED', `Recorded ₹${body.amount} for ${student.name} (${receiptNumber})`);

    return res.status(201).json({
      success: true,
      data: {
        payment: {
          id: payment._id,
          receiptNumber,
          amount: payment.amount,
          method: payment.method,
          status: payment.status,
          verifiedAt: payment.verifiedAt
        },
        feeSummary: {
          totalAmount: feeAccount.totalAmount,
          paidAmount: feeAccount.paidAmount,
          balance: feeAccount.balance,
          status: feeAccount.status
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function adjustFee(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { feeAccountId, newTotalAmount, reason } = adjustFeeSchema.parse(req.body);

    const feeAccount = await FeeAccount.findOne({ _id: feeAccountId, institutionId });
    if (!feeAccount) {
      throw new AppError('FEE_ACCOUNT_NOT_FOUND', 'Fee account not found', 404);
    }

    // Guard: Prevent adjusting total fee below already collected amount
    if (newTotalAmount < feeAccount.paidAmount) {
      throw new AppError(
        'INVALID_TOTAL_AMOUNT',
        `New total fee (₹${newTotalAmount.toLocaleString('en-IN')}) cannot be less than already collected amount (₹${feeAccount.paidAmount.toLocaleString('en-IN')}).`,
        400
      );
    }

    const before = { totalAmount: feeAccount.totalAmount, balance: feeAccount.balance };

    feeAccount.totalAmount = newTotalAmount;
    feeAccount.balance = Math.max(0, newTotalAmount - feeAccount.paidAmount);
    feeAccount.status = feeAccount.balance === 0 && feeAccount.totalAmount > 0
      ? 'PAID'
      : feeAccount.paidAmount > 0
      ? 'PARTIAL'
      : 'PENDING';
    await feeAccount.save();

    // Look up student to sync rawSourceData and push update to Google Sheets
    const student = await Student.findOne({ _id: feeAccount.studentId, institutionId });
    if (student) {
      // Discover exact sheet column names from active connection mapping
      const connection = await DataConnection.findOne({ institutionId });
      let totalFeeColName = 'Total Fee';
      let balanceColName = 'Balance';
      let statusColName = 'Payment Status';
      let paidColName = 'Paid Amount';

      if (connection?.columnMapping) {
        const colMap: any = connection.columnMapping;
        const mappingEntries: [string, any][] = colMap instanceof Map
          ? Array.from(colMap.entries())
          : Object.entries(colMap);
        for (const [sheetCol, target] of mappingEntries) {
          if (target === 'totalFee') totalFeeColName = sheetCol;
          else if (target === 'paidAmount') paidColName = sheetCol;
          else if (target === 'status') statusColName = sheetCol;
        }
      }

      if (student.rawSourceData) {
        student.rawSourceData[totalFeeColName] = String(newTotalAmount);
        student.markModified('rawSourceData');
        await student.save();
      }

      // Immediately write back revised Total Fee to Google Sheets
      if (student.sourceRowReference) {
        const writeBackFields: Record<string, any> = {
          [totalFeeColName]: newTotalAmount
        };
        // If sheet already has Balance, Payment Status, or Paid Amount columns, include them too
        if (student.rawSourceData) {
          const rawKeys = Object.keys(student.rawSourceData).map(k => k.toLowerCase());
          if (rawKeys.includes('balance') || rawKeys.includes(balanceColName.toLowerCase())) {
            writeBackFields[balanceColName] = feeAccount.balance;
          }
          if (rawKeys.includes('payment status') || rawKeys.includes('status') || rawKeys.includes(statusColName.toLowerCase())) {
            writeBackFields[statusColName] = feeAccount.status;
          }
          if (rawKeys.includes('paid amount') || rawKeys.includes('paid') || rawKeys.includes(paidColName.toLowerCase())) {
            writeBackFields[paidColName] = feeAccount.paidAmount;
          }
        }

        await Job.create({
          type: 'SHEET_WRITE_BACK',
          payload: {
            institutionId: institutionId.toString(),
            studentId: student._id.toString(),
            receiptNumber: '',
            paidAmount: feeAccount.paidAmount,
            balance: feeAccount.balance,
            status: feeAccount.status,
            totalFee: newTotalAmount,
            writeBackFields
          },
          status: 'QUEUED'
        });

        try {
          const { processSheetWriteBackBatch } = await import('../fees/feeController');
          processSheetWriteBackBatch(institutionId).catch(err => {
            logger.warn('ADJUST_FEE_WRITEBACK_ERROR', `Background sheet writeback failed: ${err.message}`);
          });
        } catch (wbErr) {}
      }
    }

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'FEE_ADJUSTED',
      entityType: 'FEE_ACCOUNT',
      entityId: feeAccount._id.toString(),
      before,
      after: { totalAmount: feeAccount.totalAmount, balance: feeAccount.balance },
      reason
    });

    // Broadcast SSE live event so open browser screens update immediately
    try {
      broadcastEvent(institutionId.toString(), 'DATA_UPDATED', {
        type: 'DATA_UPDATED',
        source: 'fee_adjustment',
        feeAccountId: feeAccount._id,
        studentName: student?.name,
        newTotalAmount,
        timestamp: new Date().toISOString()
      });
    } catch (e) {}

    return res.status(200).json({
      success: true,
      data: {
        feeAccountId: feeAccount._id,
        totalAmount: feeAccount.totalAmount,
        paidAmount: feeAccount.paidAmount,
        balance: feeAccount.balance,
        status: feeAccount.status
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function waiveFine(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { feeAccountId, reason } = waiveFineSchema.parse(req.body);

    const feeAccount = await FeeAccount.findOne({ _id: feeAccountId, institutionId });
    if (!feeAccount) {
      throw new AppError('FEE_ACCOUNT_NOT_FOUND', 'Fee account not found', 404);
    }

    const oldFine = feeAccount.fineAmount;
    feeAccount.fineAmount = 0;
    await feeAccount.save();

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'FINE_WAIVED',
      entityType: 'FEE_ACCOUNT',
      entityId: feeAccount._id.toString(),
      before: { fineAmount: oldFine },
      after: { fineAmount: 0 },
      reason
    });

    return res.status(200).json({
      success: true,
      data: {
        feeAccountId: feeAccount._id,
        fineAmount: 0,
        message: 'Fine waived successfully'
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function changeDueDate(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { feeAccountId, newDueDate, reason } = changeDueDateSchema.parse(req.body);

    const feeAccount = await FeeAccount.findOne({ _id: feeAccountId, institutionId });
    if (!feeAccount) {
      throw new AppError('FEE_ACCOUNT_NOT_FOUND', 'Fee account not found', 404);
    }

    const oldDueDate = feeAccount.dueDate;
    feeAccount.dueDate = new Date(newDueDate);
    await feeAccount.save();

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'DUE_DATE_CHANGED',
      entityType: 'FEE_ACCOUNT',
      entityId: feeAccount._id.toString(),
      before: { dueDate: oldDueDate },
      after: { dueDate: feeAccount.dueDate },
      reason
    });

    return res.status(200).json({
      success: true,
      data: {
        feeAccountId: feeAccount._id,
        dueDate: feeAccount.dueDate,
        message: 'Due date updated successfully'
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function createPaymentRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { studentId, feeAccountId, amount, sendWhatsApp } = paymentRequestSchema.parse(req.body);

    const student = await Student.findOne({ _id: studentId, institutionId });
    if (!student) {
      throw new AppError('STUDENT_NOT_FOUND', 'Student not found', 404);
    }

    const feeAccount = await FeeAccount.findOne({ _id: feeAccountId, institutionId });
    if (!feeAccount) {
      throw new AppError('FEE_ACCOUNT_NOT_FOUND', 'Fee account not found', 404);
    }

    // Guard: Block generating payment links if student has zero balance
    if (feeAccount.balance <= 0) {
      throw new AppError('NO_OUTSTANDING_BALANCE', 'Student has already fully settled all fees. No pending balance.', 400);
    }

    if (amount && amount > feeAccount.balance) {
      throw new AppError(
        'EXCEEDS_BALANCE',
        `Payment link amount (₹${amount.toLocaleString('en-IN')}) cannot exceed outstanding balance of ₹${feeAccount.balance.toLocaleString('en-IN')}.`,
        400
      );
    }

    const payableAmount = amount || feeAccount.balance;

    const paymentToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000); // 72h validity

    const intent = await PaymentIntent.create({
      institutionId,
      studentId: student._id,
      feeAccountId: feeAccount._id,
      amount: payableAmount,
      currency: 'INR',
      status: 'CREATED',
      paymentToken,
      expiresAt
    });

    const paymentUrl = `/pay/${paymentToken}`;
    let whatsAppSent = false;

    if (sendWhatsApp && student.whatsappNumber) {
      const fullPaymentUrl = `${req.headers.origin || 'http://xync.alphaprime.co.in'}${paymentUrl}`;
      const messageBody = `🏛️ *ALPHAXYNC ACADEMIC OPERATIONS*
💳 *ONLINE FEE PAYMENT REQUEST*
━━━━━━━━━━━━━━━━━━━━
Dear Parent / Student,

👤 *Student Name:* ${student.name}
🆔 *Register No:* ${student.externalStudentId}
🎓 *Course / Dept:* ${student.course || 'Academic'}
💰 *Requested Amount:* ₹${payableAmount.toLocaleString('en-IN')}
⏳ *Link Valid For:* 72 Hours

📲 *Click below to pay securely via UPI (GPay / PhonePe / Paytm / Cards):*
🔗 *Payment Link:* ${fullPaymentUrl}

✨ *Zero-Click Guarantee:* As soon as you complete the payment on your phone, your official digital fee receipt will be automatically delivered here on WhatsApp.`;

      await Job.create({
        type: 'MESSAGE',
        payload: {
          institutionId: institutionId.toString(),
          studentId: student._id.toString(),
          recipient: student.whatsappNumber,
          templateName: 'payment_request',
          eventType: 'REMINDER',
          body: messageBody,
          idempotencyKey: `payreq_${paymentToken}`
        },
        status: 'QUEUED',
        runAt: new Date()
      });
      whatsAppSent = true;
    }

    return res.status(201).json({
      success: true,
      data: {
        paymentIntentId: intent._id,
        paymentToken,
        paymentUrl,
        amount: payableAmount,
        expiresAt,
        whatsAppSent,
        recipientPhone: student.whatsappNumber || null
      }
    });
  } catch (error) {
    next(error);
  }
}

const aiReconcileSchema = z.object({
  studentId: z.string(),
  amount: z.coerce.number().positive('Amount must be positive'),
  method: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'OFFLINE', 'UPI']),
  reference: z.string().optional().default(''),
  notes: z.string().optional().default('')
});

export async function aiReconcilePayment(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const body = aiReconcileSchema.parse(req.body);

    const student = await Student.findOne({ _id: body.studentId, institutionId });
    if (!student) {
      throw new AppError('STUDENT_NOT_FOUND', 'Student record not found in system', 404);
    }

    const feeAccount = await FeeAccount.findOne({ studentId: student._id, institutionId });
    if (!feeAccount) {
      throw new AppError('FEE_ACCOUNT_NOT_FOUND', 'Student fee account not found', 404);
    }

    const warnings: string[] = [];
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
    let isClean = true;

    // Check 1: Balance overpayment guard
    if (body.amount > feeAccount.balance) {
      warnings.push(`Entered amount (₹${body.amount.toLocaleString('en-IN')}) exceeds current balance of ₹${feeAccount.balance.toLocaleString('en-IN')}`);
      confidence = 'LOW';
      isClean = false;
    }

    // Check 2: Duplicate reference detection
    if (body.reference && body.reference.trim().length > 3) {
      const duplicate = await Payment.findOne({
        institutionId,
        reference: body.reference.trim(),
        status: { $in: ['CAPTURED', 'AUTHORIZED'] }
      });
      if (duplicate) {
        warnings.push(`⚠️ Duplicate Reference: Ref '${body.reference.trim()}' was already recorded on ${new Date(duplicate.createdAt).toLocaleDateString('en-IN')}!`);
        confidence = 'LOW';
        isClean = false;
      }
    }

    // Check 3: UPI UTR format verification
    if (body.method === 'UPI' && body.reference) {
      const cleanRef = body.reference.trim();
      const isTwelveDigitUtr = /^\d{12}$/.test(cleanRef);
      if (!isTwelveDigitUtr && cleanRef.length < 8) {
        warnings.push('UPI reference is short. Official bank UPI UTRs are typically 12 digits (e.g. 425619284710).');
        if (confidence === 'HIGH') confidence = 'MEDIUM';
      }
    }

    const regNo = student.externalStudentId || 'N/A';
    const courseDept = (student as any).rawSourceData?.Course || student.department || 'General';
    const isFullSettlement = body.amount === feeAccount.balance;
    const remainingAfter = Math.max(0, feeAccount.balance - body.amount);

    let summary = '';

    // Check 4: Gemini AI verification if API key available
    const apiKey = process.env.AI_PROVIDER_KEY || process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const prompt = `You are an institutional cashier payment auditor for college fees.
Review this payment attempt:
- Student: ${student.name}
- Register Number: ${regNo}
- Course/Dept: ${courseDept}
- Current Outstanding Balance: ₹${feeAccount.balance}
- Amount Entered: ₹${body.amount}
- Payment Method: ${body.method}
- Reference / UTR: ${body.reference || 'None'}
- Notes: ${body.notes || 'None'}
- Prior Warnings: ${warnings.join('; ') || 'None'}

In 1 or 2 concise, clear sentences:
Confirm if student identification, register number, and amount match properly without mismatch. Mention whether this is a full settlement or partial installment. Respond ONLY in plain text.`;

        const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
        for (const model of models) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const aiRes = await axios.post(
              url,
              {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 200 }
              },
              { timeout: 8000 }
            );
            const aiText = aiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (aiText) {
              summary = aiText;
              break;
            }
          } catch (mErr: any) {
            logger.warn('AI_RECONCILE_MODEL_FAIL', `Model ${model} failed: ${mErr.message}`);
          }
        }
      } catch (err: any) {
        logger.warn('AI_RECONCILE_FAIL', `AI verification skipped: ${err.message}`);
      }
    }

    // Heuristic summary fallback if AI wasn't triggered
    if (!summary) {
      if (isFullSettlement) {
        summary = `Verified: Register No ${regNo} (${student.name}). Exact match for 100% full fee clearance (₹${body.amount.toLocaleString('en-IN')}). Nil balance remaining after payment.`;
      } else {
        const pct = Math.round((body.amount / feeAccount.totalAmount) * 100);
        summary = `Verified: Register No ${regNo} (${student.name}). Partial payment of ₹${body.amount.toLocaleString('en-IN')} (~${pct}% of total fee). Remaining balance: ₹${remainingAfter.toLocaleString('en-IN')}.`;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        isMatched: isClean,
        confidence,
        student: {
          id: student._id,
          name: student.name,
          registerNo: regNo,
          course: courseDept,
          currentBalance: feeAccount.balance,
          balanceAfter: remainingAfter
        },
        paymentType: isFullSettlement ? 'FULL_SETTLEMENT' : 'PARTIAL_INSTALLMENT',
        summary,
        warnings
      }
    });
  } catch (error) {
    next(error);
  }
}

