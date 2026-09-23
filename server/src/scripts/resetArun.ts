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

async function resetArun() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow');
  const student = await Student.findOne({ externalStudentId: 'ST2026-1001' });
  const fee = await FeeAccount.findOne({ studentId: student?._id });
  if (student && fee) {
    fee.totalAmount = 50000;
    fee.paidAmount = 0;
    fee.balance = 50000;
    fee.status = 'PENDING';
    await fee.save();

    if (student.rawSourceData) {
      student.rawSourceData['Total Fee'] = '50000';
      student.markModified('rawSourceData');
      await student.save();
    }

    if (student.sourceRowReference) {
      await Job.create({
        type: 'SHEET_WRITE_BACK',
        payload: {
          institutionId: student.institutionId.toString(),
          studentId: student._id.toString(),
          receiptNumber: '',
          paidAmount: 0,
          balance: 50000,
          status: 'PENDING',
          totalFee: 50000,
          writeBackFields: {
            'Total Fee': 50000
          }
        },
        status: 'QUEUED'
      });
      const { processSheetWriteBackBatch } = await import('../modules/fees/feeController');
      await processSheetWriteBackBatch(student.institutionId);
    }
  }
  await mongoose.disconnect();
  console.log('Arun Kumar reset to 50000 successfully in DB and Google Sheets');
}
resetArun();
