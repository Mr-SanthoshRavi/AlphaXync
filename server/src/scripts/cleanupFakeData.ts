import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';
import { Job } from '../models/Job';
import { Message } from '../models/Message';
import { AutomationDelivery } from '../models/AutomationDelivery';
import { DataConnection } from '../models/DataConnection';
import { SyncConflict } from '../models/SyncConflict';
import { Institution } from '../models/Institution';

const REAL_STUDENT_IDS = [
  'ST2026-1001',
  'ST2026-1002',
  'ST2026-1003',
  'ST2026-1004',
  'ST2026-1005'
];

async function runCleanup() {
  console.log('====================================================');
  console.log('  CLEANUP FAKE / MOCK DATA & ENFORCE GSHEET REALITY  ');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✓ Connected to MongoDB Atlas\n');

  // 1. Delete all fake students not in real Google Sheet
  console.log('>>> [1] Removing fake/stale student records not in Google Sheet...');
  const fakeStudents = await Student.find({
    externalStudentId: { $nin: REAL_STUDENT_IDS }
  });
  console.log(`  -> Found ${fakeStudents.length} fake/stale students to purge.`);
  const fakeStudentDbIds = fakeStudents.map((s) => s._id);

  if (fakeStudentDbIds.length > 0) {
    const deletedFeeAccounts = await FeeAccount.deleteMany({ studentId: { $in: fakeStudentDbIds } });
    console.log(`  -> Deleted ${deletedFeeAccounts.deletedCount} associated fake fee accounts.`);

    const deletedConflicts = await SyncConflict.deleteMany({ studentId: { $in: fakeStudentDbIds } });
    console.log(`  -> Deleted ${deletedConflicts.deletedCount} associated sync conflicts.`);

    const deletedDeliveries = await AutomationDelivery.deleteMany({ studentId: { $in: fakeStudentDbIds } });
    console.log(`  -> Deleted ${deletedDeliveries.deletedCount} associated automation deliveries.`);

    const deletedStudents = await Student.deleteMany({ _id: { $in: fakeStudentDbIds } });
    console.log(`  -> Deleted ${deletedStudents.deletedCount} fake students from MongoDB.`);
  }

  // 2. Strict Phone Integrity for the 5 Real Students from Google Sheet
  console.log('\n>>> [2] Enforcing strict Google Sheet phone numbers for the 5 real students...');
  
  // ST2026-1001: Arun Kumar (Has real phone: 7845560895)
  await Student.updateOne(
    { externalStudentId: 'ST2026-1001' },
    {
      $set: {
        whatsappNumber: '+917845560895',
        validationStatus: 'VALID',
        validationIssues: [],
        status: 'ACTIVE'
      }
    }
  );
  console.log('  -> ST2026-1001 (Arun Kumar): WhatsApp set to +917845560895 [VALID]');

  // ST2026-1002 to ST2026-1005: EMPTY in Google Sheet!
  const emptyPhoneStudents = ['ST2026-1002', 'ST2026-1003', 'ST2026-1004', 'ST2026-1005'];
  for (const regNo of emptyPhoneStudents) {
    await Student.updateOne(
      { externalStudentId: regNo },
      {
        $set: {
          whatsappNumber: '',
          validationStatus: 'INVALID',
          validationIssues: ['Missing WhatsApp Mobile Number'],
          status: 'ACTIVE'
        }
      }
    );
    console.log(`  -> ${regNo}: WhatsApp cleared to empty [INVALID - Missing WhatsApp Mobile Number]`);
  }

  // 3. Purge all jobs for fake numbers or non-real students
  console.log('\n>>> [3] Cleaning Job Queue from fake/dummy dispatches...');
  const fakeJobsDeleted = await Job.deleteMany({
    $or: [
      { 'payload.recipient': { $regex: /^\+9198765/ } },
      { 'payload.recipient': { $ne: '+917845560895' } },
      { 'payload.studentId': { $in: fakeStudentDbIds.map((id) => id.toString()) } }
    ]
  });
  console.log(`  -> Deleted ${fakeJobsDeleted.deletedCount} fake jobs from queue.`);

  // 4. Clean up Messages collection from fake dispatches
  console.log('\n>>> [4] Cleaning Messages collection from fake records...');
  const fakeMessagesDeleted = await Message.deleteMany({
    $or: [
      { recipient: { $regex: /^\+9198765/ } },
      { studentId: { $in: fakeStudentDbIds } }
    ]
  });
  console.log(`  -> Deleted ${fakeMessagesDeleted.deletedCount} fake message logs.`);

  // 5. Update DataConnection columnMapping with exact canonical headers
  console.log('\n>>> [5] Updating DataConnection columnMapping for exact Google Sheet headers...');
  const canonicalMapping = {
    'Register Number': 'externalStudentId',
    'Register No': 'externalStudentId',
    'Student Name': 'name',
    'Father Name': 'fatherName',
    'Mother Name': 'motherName',
    'Parent Name': 'fatherName',
    'WhatsApp Number': 'whatsappNumber',
    'Parent Mobile': 'whatsappNumber',
    'Department': 'department',
    'Course': 'course',
    'Year': 'year',
    'Section': 'section',
    'Total Fee': 'totalFee',
    'Due Date': 'dueDate',
    'Fine Date': 'dueDate',
    'Fine Amount': 'fineAmount',
    'Paid Amount': 'paidAmount',
    'Status': 'status'
  };

  await DataConnection.updateMany(
    { provider: 'google_sheets' },
    { $set: { columnMapping: canonicalMapping } }
  );
  console.log('  ✓ Column mapping updated with canonical Google Sheet synonyms.');

  // 6. Summary of current DB state
  const remainingStudents = await Student.find();
  console.log(`\n====================================================`);
  console.log(`CLEANUP COMPLETE: Remaining students count = ${remainingStudents.length}`);
  remainingStudents.forEach((s) => {
    console.log(`- ${s.externalStudentId}: ${s.name} | Phone: "${s.whatsappNumber}" | Status: ${s.status} | Validation: ${s.validationStatus}`);
  });
  console.log(`====================================================\n`);

  await mongoose.disconnect();
}

runCleanup().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
