import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Ensure models are registered
import '../models/Institution';
import '../models/Student';
import '../models/FeeAccount';
import '../models/Payment';

import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';
import { Payment } from '../models/Payment';
import { broadcastEvent } from '../modules/events/eventStream';

async function reconcile() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow');
  console.log('Connected to MongoDB');

  // Explicitly touch models
  await Student.init();
  await FeeAccount.init();
  await Payment.init();

  const feeAccounts = await FeeAccount.find({}).populate('studentId');
  console.log(`Reconciling ${feeAccounts.length} fee accounts...`);

  let reconciledCount = 0;

  for (const fee of feeAccounts) {
    const student = fee.studentId as any;
    if (!student) continue;

    // 1. Check real captured payments in database
    const verifiedPayments = await Payment.find({
      institutionId: fee.institutionId,
      studentId: student._id,
      status: 'CAPTURED'
    });

    const totalCaptured = verifiedPayments.reduce((acc, p) => acc + p.amount, 0);

    let newPaidAmount = 0;
    if (verifiedPayments.length > 0) {
      newPaidAmount = totalCaptured;
    } else {
      // Check if sheet has a Paid Amount
      const rawPaid = student.rawSourceData?.['Paid Amount'] || student.rawSourceData?.['paidAmount'];
      if (rawPaid !== undefined && String(rawPaid).trim() !== '' && !isNaN(Number(rawPaid))) {
        newPaidAmount = Number(rawPaid);
      } else {
        newPaidAmount = 0;
      }
    }

    const before = { paid: fee.paidAmount, bal: fee.balance, status: fee.status };
    fee.paidAmount = newPaidAmount;
    fee.balance = Math.max(0, fee.totalAmount - fee.paidAmount);
    fee.status = fee.balance === 0 && fee.totalAmount > 0 ? 'PAID' : fee.paidAmount > 0 ? 'PARTIAL' : 'PENDING';

    await fee.save();
    reconciledCount++;

    console.log(`[${student.externalStudentId}] ${student.name}:`);
    console.log(`  Before: paid=${before.paid}, bal=${before.bal}, status=${before.status}`);
    console.log(`  After:  paid=${fee.paidAmount}, bal=${fee.balance}, status=${fee.status} (Verified Payments: ${verifiedPayments.length})`);
  }

  // Broadcast event to active browser sessions
  if (feeAccounts.length > 0) {
    try {
      const instId = feeAccounts[0].institutionId.toString();
      broadcastEvent(instId, 'DATA_UPDATED', {
        type: 'DATA_UPDATED',
        source: 'reconciliation',
        timestamp: new Date().toISOString()
      });
      console.log('Broadcasted DATA_UPDATED SSE event.');
    } catch (e) {
      console.warn('SSE broadcast skipped');
    }
  }

  await mongoose.disconnect();
  console.log(`\nReconciliation complete: ${reconciledCount} accounts processed.`);
}

reconcile().catch(console.error);
