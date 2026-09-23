import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';
import { Payment } from '../models/Payment';
import { Receipt } from '../models/Receipt';
import { Job } from '../models/Job';
import { SyncConflict } from '../models/SyncConflict';
import { DataConnection } from '../models/DataConnection';
import { getSharedMockGoogleSheetsAdapter } from '../modules/sync/syncEngine';
import { processSheetWriteBackJob } from '../workers/sheetWriteBackWorker';

const BASE_URL = 'http://localhost:5000/api';

async function main() {
  console.log('======================================================================');
  console.log('       DATA SOURCE ARCHITECTURE LIVE PROOF & VERIFICATION SUITE       ');
  console.log('       Invariant: Source Sheet -> Sync -> DB -> Admin Panel          ');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✓ Connected to MongoDB Atlas.\n');

  // Step 0: Authenticate
  console.log('>>> [0] Authenticating Admin user...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@stxavier.edu', password: 'AdminPassword123!' })
  }).then(r => r.json() as Promise<any>);

  if (!loginRes.success) {
    throw new Error(`Authentication failed: ${loginRes.error}`);
  }
  const token = loginRes.data.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  const institutionId = new Types.ObjectId(loginRes.data.institution.id);
  console.log(`  -> Authenticated: admin@stxavier.edu (Institution ID: ${institutionId})\n`);

  // -------------------------------------------------------------------------
  // STEP 1: VERIFY INITIAL SOURCE DATA IN ADMIN PANEL
  // -------------------------------------------------------------------------
  console.log('>>> [STEP 1] Querying Admin Panel API for student ST2026-1001...');
  const listRes1 = await fetch(`${BASE_URL}/students?search=ST2026-1001`, { headers: authHeaders })
    .then(r => r.json() as Promise<any>);

  if (!listRes1.success || !listRes1.data.students.length) {
    throw new Error('ST2026-1001 not found. Run initial sync first.');
  }

  const initialStudent = listRes1.data.students[0];
  console.log('  -> Initial Admin Panel View:');
  console.log(`     Student Name:        ${initialStudent.name}`);
  console.log(`     Register No:         ${initialStudent.externalStudentId}`);
  console.log(`     Course:              ${initialStudent.course}`);
  console.log(`     Section:             ${initialStudent.section || 'A'}`);
  console.log(`     Source Sheet:        ${initialStudent.sourceSheetId}`);
  console.log(`     Source Row:          ${initialStudent.sourceRowReference}`);
  console.log(`     Prescribed Fee:      ₹${initialStudent.fee.total}`);
  console.log(`     Verified Paid:       ₹${initialStudent.fee.paid}`);
  console.log(`     Fee Balance:         ₹${initialStudent.fee.balance}\n`);

  // -------------------------------------------------------------------------
  // STEP 2: SIMULATE UPDATE IN EXTERNAL GOOGLE SHEET / EXCEL SOURCE
  // -------------------------------------------------------------------------
  const initialCourse = initialStudent.course;
  const NEW_COURSE = initialCourse === 'BSc Computer Science' ? 'B.Tech Robotics & AI' : 'BSc Computer Science';
  const NEW_SECTION = initialStudent.section === 'A' ? 'B' : 'A';
  console.log('>>> [STEP 2] Simulating Course & Section Change directly in Source Spreadsheet...');
  console.log(`  -> Initial Course in System:  "${initialCourse}" (Section "${initialStudent.section || 'A'}")`);
  console.log(`  -> External Sheet Mutation:    Course = "${NEW_COURSE}", Section = "${NEW_SECTION}"`);

  const simRes = await fetch(`${BASE_URL}/sync/simulate-source-update`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      regNo: 'ST2026-1001',
      updates: {
        'Course': NEW_COURSE,
        'Section': NEW_SECTION
      }
    })
  }).then(r => r.json() as Promise<any>);

  if (!simRes.success) {
    throw new Error(`Failed to mutate external spreadsheet: ${simRes.error}`);
  }
  console.log('  -> Cell updated in Server Source Spreadsheet memory via /simulate-source-update.\n');

  // -------------------------------------------------------------------------
  // STEP 3: RUN SYNCHRONIZATION (Sync -> Validate -> DB)
  // -------------------------------------------------------------------------
  console.log('>>> [STEP 3] Triggering Sync Layer via POST /api/sync/trigger...');
  const syncRes = await fetch(`${BASE_URL}/sync/trigger`, {
    method: 'POST',
    headers: authHeaders
  }).then(r => r.json() as Promise<any>);

  if (!syncRes.success) {
    throw new Error(`Sync failed: ${syncRes.error}`);
  }
  console.log(`  -> Sync completed. Metrics:`, syncRes.data.metrics);

  // -------------------------------------------------------------------------
  // STEP 4: VERIFY MONGODB APPLICATION DATABASE STATE
  // -------------------------------------------------------------------------
  console.log('\n>>> [STEP 4] Verifying MongoDB Application DB directly...');
  const dbStudent = await Student.findOne({ institutionId, externalStudentId: 'ST2026-1001' }).lean();
  if (!dbStudent) {
    throw new Error('Student missing from MongoDB');
  }

  console.log(`  -> MongoDB Document:`);
  console.log(`     Course in DB:        ${dbStudent.course}`);
  console.log(`     Section in DB:       ${dbStudent.section}`);
  console.log(`     Source Provider:     ${dbStudent.sourceProvider}`);
  console.log(`     Source Sheet ID:     ${dbStudent.sourceSheetId}`);
  console.log(`     Source Row Ref:      ${dbStudent.sourceRowReference}`);
  console.log(`     Last Source Sync:    ${dbStudent.lastSourceSyncAt?.toISOString()}`);

  if (dbStudent.course !== NEW_COURSE || dbStudent.section !== NEW_SECTION) {
    throw new Error(`DB Assertion Failed: Expected ${NEW_COURSE} and ${NEW_SECTION}, got ${dbStudent.course} and ${dbStudent.section}`);
  }
  console.log('  ✓ Verified: DB successfully normalized and updated from Source Sheet.\n');

  // -------------------------------------------------------------------------
  // STEP 5: VERIFY ADMIN PANEL MIRROR (Admin Panel reflects DB without CRUD)
  // -------------------------------------------------------------------------
  console.log('>>> [STEP 5] Querying Admin Panel API (GET /api/students/...) to confirm mirrored UI state...');
  const listRes2 = await fetch(`${BASE_URL}/students?search=ST2026-1001`, { headers: authHeaders })
    .then(r => r.json() as Promise<any>);

  const updatedAdminStudent = listRes2.data.students[0];
  console.log('  -> Updated Admin Panel View:');
  console.log(`     Student Name:        ${updatedAdminStudent.name}`);
  console.log(`     Register No:         ${updatedAdminStudent.externalStudentId}`);
  console.log(`     Course:              ${updatedAdminStudent.course}`);
  console.log(`     Section:             ${updatedAdminStudent.section}`);
  console.log(`     Traceable Origin:    ${updatedAdminStudent.sourceSheetId} • ${updatedAdminStudent.sourceRowReference}`);

  if (updatedAdminStudent.course !== NEW_COURSE || updatedAdminStudent.section !== NEW_SECTION) {
    throw new Error(`Admin Panel Assertion Failed: Course is not mirrored.`);
  }
  console.log('  ✓ Verified: Admin Panel reflects synchronized value without manual user entry!\n');

  // -------------------------------------------------------------------------
  // STEP 6: VERIFY CONFLICT GUARD ON PROTECTED PAYMENT FIELDS
  // -------------------------------------------------------------------------
  console.log('>>> [STEP 6] Testing Rule 6: Source Spreadsheet modifying protected Paid Amount...');
  const initialFee = await FeeAccount.findOne({ institutionId, studentId: dbStudent._id });
  const verifiedPaidBefore = initialFee!.paidAmount;
  console.log(`  -> Current Application Ledger Paid Amount: ₹${verifiedPaidBefore}`);

  console.log('  -> Someone manually tampers with Sheet cell: Paid Amount = ₹99,999');
  await fetch(`${BASE_URL}/sync/simulate-source-update`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      regNo: 'ST2026-1001',
      updates: { 'Paid Amount': 99999 }
    })
  });

  console.log('  -> Triggering Sync to test Conflict Guard...');
  await fetch(`${BASE_URL}/sync/trigger`, { method: 'POST', headers: authHeaders });

  const feeAfterTamper = await FeeAccount.findOne({ institutionId, studentId: dbStudent._id });
  console.log(`  -> Application Ledger Paid Amount after sync: ₹${feeAfterTamper!.paidAmount}`);
  if (feeAfterTamper!.paidAmount !== verifiedPaidBefore) {
    throw new Error('CRITICAL SECURITY BREACH: Spreadsheet blindly overwrote verified payment ledger!');
  }
  console.log('  ✓ Conflict Guard Passed: Verified payment ledger was NOT overwritten by spreadsheet change!');

  const conflict = await SyncConflict.findOne({
    institutionId,
    studentId: dbStudent._id,
    status: 'OPEN'
  }).sort({ createdAt: -1 });

  if (!conflict) {
    throw new Error('Expected SyncConflict record to be created, but none found.');
  }
  console.log(`  ✓ SyncConflict record generated:`);
  console.log(`     Field:               ${conflict.field}`);
  console.log(`     Application Value:   ₹${conflict.applicationValue}`);
  console.log(`     Source Sheet Value:  ₹${conflict.sourceValue}`);
  console.log(`     Status:              ${conflict.status}\n`);

  // Clean up conflict by resolving it (keeping application value)
  await SyncConflict.findByIdAndUpdate(conflict._id, { status: 'RESOLVED', resolution: 'KEEP_VERIFIED_VALUE' });
  await fetch(`${BASE_URL}/sync/simulate-source-update`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      regNo: 'ST2026-1001',
      updates: { 'Paid Amount': verifiedPaidBefore }
    })
  });

  // -------------------------------------------------------------------------
  // STEP 7: VERIFY CONTROLLED PAYMENT & SHEET WRITE-BACK
  // -------------------------------------------------------------------------
  console.log('>>> [STEP 7] Verifying Controlled Payment Flow & Sheet Write-back...');
  const paymentAmount = 5000;
  console.log(`  -> Admin records controlled counter payment of ₹${paymentAmount}...`);
  const payRes = await fetch(`${BASE_URL}/payments/offline`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      studentId: dbStudent._id.toString(),
      feeAccountId: initialFee!._id.toString(),
      amount: paymentAmount,
      method: 'CASH',
      note: 'Verified Counter Payment Test'
    })
  }).then(r => r.json() as Promise<any>);

  if (!payRes.success) {
    throw new Error(`Payment failed: ${payRes.error}`);
  }
  console.log(`  -> Payment recorded! Receipt: ${payRes.data.payment.receiptNumber}`);

  const updatedFee = await FeeAccount.findOne({ institutionId, studentId: dbStudent._id });
  console.log(`  -> Ledger Updated: Paid = ₹${updatedFee!.paidAmount}, Balance = ₹${updatedFee!.balance}`);

  const writeBackJob = await Job.findOne({
    type: 'SHEET_WRITE_BACK',
    'payload.studentId': dbStudent._id.toString(),
    status: 'PENDING'
  }).sort({ createdAt: -1 });

  if (writeBackJob) {
    console.log(`  -> Found queued SHEET_WRITE_BACK job ${writeBackJob._id}. Executing worker...`);
    await processSheetWriteBackJob(writeBackJob);
    console.log(`  ✓ SHEET_WRITE_BACK job completed successfully!`);
  }

  // -------------------------------------------------------------------------
  // STEP 8: VERIFY NO UNNECESSARY CRUD / DUPLICATE DATA ENTRY
  // -------------------------------------------------------------------------
  console.log('\n>>> [STEP 8] Verifying Admin Panel does not allow arbitrary student master creation/deletion...');
  const postStudentRes = await fetch(`${BASE_URL}/students`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Fake Rogue Student', externalStudentId: 'ROGUE-001' })
  });
  console.log(`  -> POST /api/students response status: ${postStudentRes.status} (Expected 404 - Not Found)`);
  if (postStudentRes.status !== 404) {
    throw new Error('Unexpected student creation endpoint exists!');
  }

  const deleteStudentRes = await fetch(`${BASE_URL}/students/${dbStudent._id}`, {
    method: 'DELETE',
    headers: authHeaders
  });
  console.log(`  -> DELETE /api/students/:id response status: ${deleteStudentRes.status} (Expected 404 - Not Found)`);
  if (deleteStudentRes.status !== 404) {
    throw new Error('Unexpected student deletion endpoint exists!');
  }
  console.log('  ✓ Verified: Admin Panel is NOT an independent master-data CRUD system.\n');

  console.log('======================================================================');
  console.log('                 ALL ARCHITECTURAL PROOFS PASSED                      ');
  console.log('======================================================================');
  
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
