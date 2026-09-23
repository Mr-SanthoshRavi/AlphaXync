import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../models/Institution';
import '../models/Student';
import '../models/FeeAccount';
import '../models/Payment';
import '../models/Job';
import '../models/DataConnection';

import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';
import { Job } from '../models/Job';

async function testAdjust() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow');
  console.log('Connected to MongoDB');

  const student = await Student.findOne({ externalStudentId: 'ST2026-1001' });
  if (!student) {
    console.error('Student ST2026-1001 not found');
    process.exit(1);
  }

  const feeAccount = await FeeAccount.findOne({ studentId: student._id });
  if (!feeAccount) {
    console.error('FeeAccount not found');
    process.exit(1);
  }

  console.log(`\nCurrent Fee for ${student.name}: ₹${feeAccount.totalAmount}, Balance: ₹${feeAccount.balance}`);

  // Test adjusting fee to 48000
  const newAmount = 48000;
  feeAccount.totalAmount = newAmount;
  feeAccount.balance = Math.max(0, newAmount - feeAccount.paidAmount);
  feeAccount.status = feeAccount.balance === 0 && feeAccount.totalAmount > 0 ? 'PAID' : feeAccount.paidAmount > 0 ? 'PARTIAL' : 'PENDING';
  await feeAccount.save();

  if (student.rawSourceData) {
    student.rawSourceData['Total Fee'] = String(newAmount);
    student.markModified('rawSourceData');
    await student.save();
  }

  if (student.sourceRowReference) {
    const job = await Job.create({
      type: 'SHEET_WRITE_BACK',
      payload: {
        institutionId: student.institutionId.toString(),
        studentId: student._id.toString(),
        receiptNumber: '',
        paidAmount: feeAccount.paidAmount,
        balance: feeAccount.balance,
        status: feeAccount.status,
        totalFee: newAmount,
        writeBackFields: {
          'Total Fee': newAmount
        }
      },
      status: 'QUEUED'
    });
    console.log(`Queued SHEET_WRITE_BACK Job: ${job._id}`);

    const { processSheetWriteBackBatch } = await import('../modules/fees/feeController');
    await processSheetWriteBackBatch(student.institutionId);
    console.log('Executed processSheetWriteBackBatch successfully!');
  }

  const updatedFee = await FeeAccount.findOne({ studentId: student._id });
  console.log(`\nUpdated Fee in DB: ₹${updatedFee?.totalAmount}, Balance: ₹${updatedFee?.balance}`);

  await mongoose.disconnect();
  console.log('Test completed successfully!');
}

testAdjust().catch(console.error);
