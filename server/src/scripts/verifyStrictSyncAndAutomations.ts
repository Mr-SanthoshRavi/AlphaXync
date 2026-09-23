import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';
import { Job } from '../models/Job';
import { Message } from '../models/Message';
import { DataConnection } from '../models/DataConnection';
import { runSync } from '../modules/sync/syncEngine';
import { evaluateGreetings, evaluateFeeReminders } from '../workers/automationWorker';

async function verify() {
  console.log('======================================================');
  console.log('  VERIFYING STRICT GSHEET SYNC & AUTOMATION BEHAVIOR  ');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGODB_URI!);

  const conn = await DataConnection.findOne({ provider: 'google_sheets' });
  if (!conn) throw new Error('No Google Sheets connection found');

  console.log(`>>> [1] Running Sync on Connection: ${conn._id} (${conn.accountReference})...`);
  const metrics = await runSync(conn._id.toString());
  console.log('  ✓ Sync Metrics:', metrics);

  // Verify Student Count in DB
  const activeStudents = await Student.find({ institutionId: conn.institutionId, status: 'ACTIVE' });
  console.log(`\n>>> [2] Active Students Count in DB: ${activeStudents.length} (Expected: 5)`);
  if (activeStudents.length !== 5) {
    throw new Error(`Expected 5 active students, got ${activeStudents.length}`);
  }

  // Verify Phone Numbers
  console.log('\n>>> [3] Checking Individual Student WhatsApp Statuses:');
  for (const st of activeStudents) {
    console.log(`  - ${st.externalStudentId} (${st.name}): Phone="${st.whatsappNumber}", Status=${st.validationStatus}, Issues=${JSON.stringify(st.validationIssues)}`);
    if (st.externalStudentId === 'ST2026-1001') {
      if (st.whatsappNumber !== '+917845560895' || st.validationStatus !== 'VALID') {
        throw new Error(`ST2026-1001 expected +917845560895 VALID, got ${st.whatsappNumber} ${st.validationStatus}`);
      }
    } else {
      if (st.whatsappNumber !== '' || st.validationStatus !== 'INVALID') {
        throw new Error(`${st.externalStudentId} expected empty phone and INVALID, got "${st.whatsappNumber}" ${st.validationStatus}`);
      }
    }
  }
  console.log('  ✓ Verified: Only ST2026-1001 has valid phone. Other 4 students have empty phone!');

  // Verify Automations Evaluation
  console.log('\n>>> [4] Testing Greeting & Fee Reminder Automations...');
  const greetingsQueued = await evaluateGreetings(conn.institutionId);
  console.log(`  -> Greetings queued: ${greetingsQueued}`);

  const feeRemindersQueued = await evaluateFeeReminders(conn.institutionId);
  console.log(`  -> Fee reminders queued: ${feeRemindersQueued}`);

  // Verify Pending Jobs in Queue
  const pendingJobs = await Job.find({ status: { $in: ['QUEUED', 'SENDING', 'WAITING'] } });
  console.log(`\n>>> [5] Pending Outbound Message Jobs in Queue: ${pendingJobs.length}`);
  for (const j of pendingJobs) {
    console.log(`  - Job ${j._id} [${j.status}] -> Recipient: "${j.payload.recipient}", StudentId: ${j.payload.studentId}`);
    if (j.payload.recipient !== '+917845560895') {
      throw new Error(`CRITICAL: Detected job with non-whitelisted recipient: ${j.payload.recipient}`);
    }
  }

  console.log('\n======================================================');
  console.log('  ALL STRICT GSHEET & WHATSAPP RULES 100% VERIFIED!   ');
  console.log('======================================================\n');

  await mongoose.disconnect();
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
