import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';
import { Payment } from '../models/Payment';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow');
  
  const students = await Student.find({});
  for (const s of students) {
    const fee = await FeeAccount.findOne({ studentId: s._id });
    const payments = await Payment.find({ studentId: s._id });
    console.log(`Student: ${s.name} (${s.externalStudentId})`);
    console.log(`  rawSourceData keys:`, Object.keys(s.rawSourceData || {}));
    console.log(`  rawSourceData values:`, s.rawSourceData);
    console.log(`  FeeAccount: total=${fee?.totalAmount}, paid=${fee?.paidAmount}, balance=${fee?.balance}, status=${fee?.status}`);
    console.log(`  Payments in DB (${payments.length}):`, payments.map(p => ({ amount: p.amount, method: p.method, status: p.status })));
  }

  await mongoose.disconnect();
}

check().catch(console.error);
