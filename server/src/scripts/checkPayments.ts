import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Payment } from '../models/Payment';
import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow');
  
  const payments = await Payment.find({}).populate('studentId').lean();
  console.log('--- PAYMENTS IN DB (' + payments.length + ') ---');
  payments.forEach((p: any) => {
    console.log({
      id: p._id,
      studentName: p.studentId?.name,
      studentId: p.studentId?.externalStudentId,
      amount: p.amount,
      status: p.status,
      method: p.method,
      source: p.source,
      receiptNumber: p.receiptNumber,
      createdAt: p.createdAt
    });
  });

  const feeAccounts = await FeeAccount.find({}).populate('studentId').lean();
  console.log('\n--- FEE ACCOUNTS IN DB (' + feeAccounts.length + ') ---');
  feeAccounts.forEach((f: any) => {
    console.log({
      id: f._id,
      studentName: f.studentId?.name,
      studentId: f.studentId?.externalStudentId,
      totalAmount: f.totalAmount,
      paidAmount: f.paidAmount,
      balance: f.balance,
      status: f.status
    });
  });

  await mongoose.disconnect();
}

check().catch(console.error);
