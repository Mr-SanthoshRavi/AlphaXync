import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Institution } from '../models/Institution';
import { User } from '../models/User';
import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';
import { Payment } from '../models/Payment';
import { PaymentIntent } from '../models/PaymentIntent';
import { Receipt } from '../models/Receipt';
import { Job } from '../models/Job';
import { Message } from '../models/Message';
import { DataConnection } from '../models/DataConnection';
import { Automation } from '../models/Automation';
import { AutomationDelivery } from '../models/AutomationDelivery';
import { SyncConflict } from '../models/SyncConflict';
import { AuditLog } from '../models/AuditLog';
import { signAccessToken } from '../middleware/auth';
import { getSharedMockGoogleSheetsAdapter, runSync } from '../modules/sync/syncEngine';
import { evaluateGreetings, evaluateFeeReminders } from '../workers/automationWorker';
import { processMessageJob } from '../workers/messageWorker';
import { processSheetWriteBackJob } from '../workers/sheetWriteBackWorker';
import { MockWhatsAppProvider } from '../integrations/whatsapp/MockWhatsAppProvider';

describe('Phase 2H: Complete End-to-End Acceptance Workflow (Section 103)', () => {
  let app: ReturnType<typeof createApp>;
  let institutionId: mongoose.Types.ObjectId;
  let adminToken: string;
  let cashierToken: string;
  let connectionId: string;
  let mockWhatsApp: MockWhatsAppProvider;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.USE_MOCK_PROVIDERS = 'true';
    await connectDatabase();
    app = createApp();

    // Clean All Collections
    await Institution.deleteMany({});
    await User.deleteMany({});
    await Student.deleteMany({});
    await FeeAccount.deleteMany({});
    await Payment.deleteMany({});
    await PaymentIntent.deleteMany({});
    await Receipt.deleteMany({});
    await Job.deleteMany({});
    await Message.deleteMany({});
    await DataConnection.deleteMany({});
    await Automation.deleteMany({});
    await AutomationDelivery.deleteMany({});
    await SyncConflict.deleteMany({});
    await AuditLog.deleteMany({});

    mockWhatsApp = new MockWhatsAppProvider();
  });

  afterAll(async () => {
    delete process.env.USE_MOCK_PROVIDERS;
    await disconnectDatabase();
  });

  it('Step 1: System Setup - Create institution & admin user', async () => {
    const res = await request(app).post('/api/auth/setup').send({
      institutionName: "St. Xavier's Engineering College",
      institutionCode: 'STXAVIER',
      adminName: 'Dr. Ramanathan',
      email: 'admin@stxavier.edu',
      password: 'AdminPassword123!'
    });

    expect(res.status).toBe(201);
    institutionId = new mongoose.Types.ObjectId(res.body.data.institution.id);

    // Login as Admin
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'admin@stxavier.edu',
      password: 'AdminPassword123!'
    });
    expect(loginRes.status).toBe(200);
    adminToken = loginRes.body.data.token;
  });

  it('Step 2: Connect Source Spreadsheet & Discover Columns', async () => {
    const conn = await DataConnection.create({
      institutionId,
      provider: 'google_sheets',
      status: 'CONNECTED',
      accountReference: 'finance@stxavier.edu',
      sheetReference: 'Students_Master',
      syncInterval: 60
    });
    connectionId = conn._id.toString();

    const res = await request(app)
      .get('/api/sync/discover')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.columns).toContain('Register No');
    expect(res.body.data.columns).toContain('Student Name');
    expect(res.body.data.suggestedMapping['Register No']).toBe('externalStudentId');
  });

  it('Step 3: Admin Maps & Confirms Columns', async () => {
    const mapping = {
      'Register No': 'externalStudentId',
      'Student Name': 'name',
      'Parent Name': 'fatherName',
      'Parent Mobile': 'whatsappNumber',
      'Course': 'course',
      'Department': 'department',
      'Year': 'year',
      'Section': 'section',
      'Total Fee': 'totalFee',
      'Paid Amount': 'paidAmount',
      'Due Date': 'dueDate',
      'Fine Amount': 'fineAmount'
    };

    const res = await request(app)
      .post('/api/sync/mapping')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mapping });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Step 4: Sync & Validate Records - 50 Students Ingested', async () => {
    const syncRes = await request(app)
      .post('/api/sync/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.data.metrics.rowsRead).toBe(50);
    expect(syncRes.body.data.metrics.rowsAdded).toBe(50);

    const validCount = await Student.countDocuments({ institutionId, validationStatus: 'VALID' });
    expect(validCount).toBe(45); // 5 records had missing/invalid phone numbers
  }, 25000);

  it('Step 5: Greeting Automation Identifies New Students & Queues Once', async () => {
    // Admin opens Automations center (initializes the 5 modules)
    const listRes = await request(app)
      .get('/api/automations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);

    const toggleRes = await request(app)
      .patch('/api/automations/GREETING/toggle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.data.enabled).toBe(true);

    const queuedCount = await evaluateGreetings(institutionId);
    expect(queuedCount).toBe(45);

    // Process all queued message jobs
    const messageJobs = await Job.find({ type: 'MESSAGE', status: 'QUEUED' });
    for (const j of messageJobs) {
      await processMessageJob(j, mockWhatsApp);
      j.status = 'COMPLETED';
      await j.save();
    }

    const totalGreetingMessages = await Message.countDocuments({
      institutionId,
      templateName: 'student_greeting'
    });
    expect(totalGreetingMessages).toBe(45);

    const sentGreetings = await Message.countDocuments({
      institutionId,
      status: 'SENT',
      templateName: 'student_greeting'
    });
    expect(sentGreetings).toBeGreaterThanOrEqual(40);

    // REPEAT EVALUATION: ZERO DUPLICATES!
    const reQueued = await evaluateGreetings(institutionId);
    expect(reQueued).toBe(0);
  }, 25000);

  it('Step 6: Fee Reminder Timeline Evaluates for Pending Balances', async () => {
    const toggleFee = await request(app)
      .patch('/api/automations/FEE/toggle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true });
    expect(toggleFee.status).toBe(200);
    expect(toggleFee.body.data.enabled).toBe(true);

    const feeReminderCount = await evaluateFeeReminders(institutionId);
    expect(feeReminderCount).toBeGreaterThan(0);
  });

  it('Step 7: Payment Request & Public Checkout (/pay/:token)', async () => {
    // Pick an eligible student with pending balance
    const student = await Student.findOne({ institutionId, validationStatus: 'VALID' });
    const feeAccount = await FeeAccount.findOne({ studentId: student!._id });

    // 1. Staff creates payment request link
    const reqRes = await request(app)
      .post('/api/payments/request')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentId: student!._id.toString(),
        feeAccountId: feeAccount!._id.toString(),
        amount: 10000
      });

    expect(reqRes.status).toBe(201);
    const token = reqRes.body.data.paymentToken;

    // 2. Student opens public payment page
    const pageRes = await request(app).get(`/api/public/pay/${token}`);
    expect(pageRes.status).toBe(200);
    expect(pageRes.body.data.studentName).toBe(student!.name);
    expect(pageRes.body.data.amount).toBe(10000);

    // 3. Student triggers Razorpay Checkout
    const orderRes = await request(app).post(`/api/public/pay/${token}/order`);
    expect(orderRes.status).toBe(200);
    const orderId = orderRes.body.data.orderId;

    // 4. Razorpay returns signature -> Backend verifies & captures
    const verifyRes = await request(app)
      .post(`/api/public/pay/${token}/verify`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: 'pay_live_e2e_9988',
        razorpaySignature: 'valid_mock_signature'
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verified).toBe(true);
    expect(verifyRes.body.data.receiptNumber).toMatch(/^REC-2026-\d{6}$/);

    // 5. Verify FeeAccount recalculation
    const updatedFee = await FeeAccount.findById(feeAccount!._id);
    expect(updatedFee!.paidAmount).toBe(feeAccount!.paidAmount + 10000);
    expect(updatedFee!.balance).toBe(feeAccount!.balance - 10000);

    // 6. Execute queued write-back background job
    const writeBackJob = await Job.findOne({ type: 'SHEET_WRITE_BACK', status: 'QUEUED' });
    expect(writeBackJob).toBeDefined();
    await processSheetWriteBackJob(writeBackJob!);

    // 7. Verify write-back into spreadsheet
    const mockAdapter = getSharedMockGoogleSheetsAdapter();
    const rows = await mockAdapter.readRows('Students_Master');
    const row = rows.find((r) => r.rowReference === student!.sourceRowReference);
    expect(row!.values['Paid Amount']).toBe(updatedFee!.paidAmount);
    expect(row!.values['Receipt No']).toBe(verifyRes.body.data.receiptNumber);

    // 8. Re-check Webhook Idempotency: replay the same payment
    const replayWebhook = await request(app)
      .post('/webhooks/razorpay')
      .set('x-razorpay-signature', 'valid_mock_webhook_signature')
      .send({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_live_e2e_9988', // Same Payment ID
              order_id: orderId,
              amount: 1000000
            }
          }
        }
      });
    expect(replayWebhook.status).toBe(200);
    expect(replayWebhook.body.status).toBe('already_processed');
  });

  it('Step 8: Spreadsheet Payment Modification Detects Conflict Without Overwriting Ledger', async () => {
    const student = await Student.findOne({ institutionId, validationStatus: 'VALID' });
    const feeAccount = await FeeAccount.findOne({ studentId: student!._id });

    // Someone externally edits the sheet cell to claim paid is ₹99,999
    const mockAdapter = getSharedMockGoogleSheetsAdapter();
    mockAdapter.setCellDirectly('Students_Master', student!.externalStudentId, 'Paid Amount', 99999);

    // Trigger sync
    await request(app)
      .post('/api/sync/trigger')
      .set('Authorization', `Bearer ${adminToken}`);

    // Check conflict created
    const conflict = await SyncConflict.findOne({ studentId: student!._id, status: 'OPEN' });
    expect(conflict).toBeDefined();
    expect(conflict!.field).toBe('paidAmount');
    expect(conflict!.sourceValue).toBe('₹99999');

    // CRITICAL: Ledger was NOT overwritten!
    const feeReloaded = await FeeAccount.findById(feeAccount!._id);
    expect(feeReloaded!.paidAmount).toBe(feeAccount!.paidAmount);
  });

  it('Step 9: Dashboard Summary & Audit Log Complete Traceability', async () => {
    const dashRes = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.cards.totalStudents).toBe(50);
    expect(dashRes.body.data.cards.paidToday).toBeGreaterThan(0);
    expect(dashRes.body.data.cards.messagesSentToday).toBeGreaterThanOrEqual(40);
    expect(dashRes.body.data.recentActivity.length).toBeGreaterThan(0);

    // Audit Log contains immutable history
    const auditCount = await AuditLog.countDocuments({ institutionId });
    expect(auditCount).toBeGreaterThan(5);
  });
});
