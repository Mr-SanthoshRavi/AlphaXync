import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import '../models/Institution';
import '../models/Student';
import '../models/FeeAccount';
import '../models/Payment';
import '../models/Job';
import '../models/DataConnection';

import { DataConnection } from '../models/DataConnection';
import { getAdapterForConnection, runSync } from '../modules/sync/syncEngine';
import { getValidGoogleCredentials } from '../modules/connections/googleConnectionController';
import { FeeAccount } from '../models/FeeAccount';
import { Student } from '../models/Student';

async function testTwoWaySync() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow');
  console.log('Connected to DB');

  const conn = await DataConnection.findOne({ provider: 'google_sheets' });
  if (!conn) {
    console.error('No connection');
    process.exit(1);
  }

  const creds = await getValidGoogleCredentials(conn);
  const adapter = await getAdapterForConnection(conn);
  await adapter.connect({
    accessToken: creds.accessToken,
    spreadsheetId: creds.spreadsheetId || conn.fileReference
  });

  // Step 1: In Google Sheet, set Arun Kumar Total Fee to 50000 and Paid Amount to empty/0
  console.log('\n--- Step 1: Changing Google Sheet row 2 directly to Total Fee = 50000, Paid Amount = 0 ---');
  await adapter.updateRow(conn.sheetReference || 'Students_Master', 'Students_Master!A2:N2', {
    'Total Fee': 50000,
    'Paid Amount': 0,
    'Balance': 50000
  });
  console.log('Successfully updated Google Sheet directly!');

  // Step 2: Trigger SyncEngine
  console.log('\n--- Step 2: Triggering syncEngine.runSync() ---');
  const metrics = await runSync(conn._id.toString());
  console.log('Sync metrics:', metrics);

  // Step 3: Check DB reflection
  const arun = await Student.findOne({ externalStudentId: 'ST2026-1001' });
  const arunFee = await FeeAccount.findOne({ studentId: arun?._id });
  console.log('\n--- Step 3: Verifying Admin DB state ---');
  console.log('Student:', arun?.name, 'Total Fee in DB:', arunFee?.totalAmount, 'Balance:', arunFee?.balance, 'Paid:', arunFee?.paidAmount);

  if (arunFee?.totalAmount === 50000) {
    console.log('>>> VERIFICATION PASSED: Google Sheet edit correctly synced to Admin Panel!');
  } else {
    console.error('>>> VERIFICATION FAILED: Total amount does not match sheet edit!');
  }

  await mongoose.disconnect();
}

testTwoWaySync().catch(console.error);
