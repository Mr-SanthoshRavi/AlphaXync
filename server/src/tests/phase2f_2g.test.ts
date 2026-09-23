import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { createApp } from '../app';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Institution } from '../models/Institution';
import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';
import { Payment } from '../models/Payment';
import { PaymentIntent } from '../models/PaymentIntent';
import { Receipt } from '../models/Receipt';
import { Job } from '../models/Job';
import { DataConnection } from '../models/DataConnection';
import { generateSecureToken } from '../utils/crypto';
import { processSheetWriteBackJob } from '../workers/sheetWriteBackWorker';
import { MockGoogleSheetsAdapter } from '../integrations/MockGoogleSheetsAdapter';
import { runSync, getSharedMockGoogleSheetsAdapter } from '../modules/sync/syncEngine';
import { env } from '../config/env';

describe('Phase 2F & 2G: Razorpay Protected Ledger, Webhooks & Write-Back Tests', () => {
  let app: ReturnType<typeof createApp>;
  let institutionId: mongoose.Types.ObjectId;
  let sampleStudent: any;
  let sampleFee: any;
  let paymentToken: string;
  let mockAdapter: MockGoogleSheetsAdapter;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.USE_MOCK_PROVIDERS = 'true';
    await connectDatabase();
    app = createApp();

    await Institution.deleteMany({});
    await Student.deleteMany({});
    await FeeAccount.deleteMany({});
    await Payment.deleteMany({});
    await PaymentIntent.deleteMany({});
    await Receipt.deleteMany({});
    await Job.deleteMany({});
    await DataConnection.deleteMany({});

    const inst = await Institution.create({
      name: 'Engineering College',
      code: 'ENGCOL'
    });
    institutionId = inst._id as mongoose.Types.ObjectId;

    // Create Connection & Ingest Students
    mockAdapter = getSharedMockGoogleSheetsAdapter();
    const conn = await DataConnection.create({
      institutionId,
      provider: 'google_sheets',
      sheetReference: 'Students_Master',
      columnMapping: {
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
      }
    });

    await runSync(conn._id.toString(), mockAdapter);

    // Pick an active student with a pending fee
    sampleStudent = await Student.findOne({ institutionId, validationStatus: 'VALID' });
    sampleFee = await FeeAccount.findOne({ studentId: sampleStudent._id });

    paymentToken = generateSecureToken(32);
    await PaymentIntent.create({
      institutionId,
      studentId: sampleStudent._id,
      feeAccountId: sampleFee._id,
      amount: 15000,
      currency: 'INR',
      status: 'CREATED',
      paymentToken,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000)
    });
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('Public Payment Checkout (/pay/:token)', () => {
    it('GET /api/public/pay/:token loads student & fee details without leaking mongo IDs', async () => {
      const res = await request(app).get(`/api/public/pay/${paymentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.studentName).toBe(sampleStudent.name);
      expect(res.body.data.amount).toBe(15000);
      expect(res.body.data.institutionName).toBe('Engineering College');
      // ID leak protection: no mongo _id exposed
      expect(res.body.data._id).toBeUndefined();
      expect(res.body.data.studentId).toBeUndefined();
    });

    it('POST /api/public/pay/:token/order creates an online Razorpay order', async () => {
      const res = await request(app).post(`/api/public/pay/${paymentToken}/order`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toMatch(/^order_mock_/);
      expect(res.body.data.amount).toBe(15000);
      expect(res.body.data.keyId).toBeDefined();

      const intent = await PaymentIntent.findOne({ paymentToken });
      expect(intent!.razorpayOrderId).toBe(res.body.data.orderId);
    });

    it('POST /api/public/pay/:token/verify rejects invalid signatures', async () => {
      const res = await request(app)
        .post(`/api/public/pay/${paymentToken}/verify`)
        .send({
          razorpayOrderId: 'order_mock_123',
          razorpayPaymentId: 'pay_mock_999',
          razorpaySignature: 'invalid_fraudulent_signature'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SIGNATURE_VERIFICATION_FAILED');
    });

    it('POST /api/public/pay/:token/verify captures payment, recalculates balance, generates receipt, and queues write-back', async () => {
      const initialPaid = sampleFee.paidAmount;
      const initialBalance = sampleFee.balance;

      const res = await request(app)
        .post(`/api/public/pay/${paymentToken}/verify`)
        .send({
          razorpayOrderId: 'order_mock_123',
          razorpayPaymentId: 'pay_mock_verified_888',
          razorpaySignature: 'valid_mock_signature' // Mock provider accepts this
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verified).toBe(true);
      expect(res.body.data.receiptNumber).toMatch(/^REC-2026-\d{6}$/);

      // 1. Check Payment record created & CAPTURED
      const payment = await Payment.findOne({ providerPaymentId: 'pay_mock_verified_888' });
      expect(payment).toBeDefined();
      expect(payment!.status).toBe('CAPTURED');
      expect(payment!.amount).toBe(15000);

      // 2. Check FeeAccount recalculated
      const updatedFee = await FeeAccount.findById(sampleFee._id);
      expect(updatedFee!.paidAmount).toBe(initialPaid + 15000);
      expect(updatedFee!.balance).toBe(initialBalance - 15000);

      // 3. Check Receipt created
      const receipt = await Receipt.findOne({ paymentId: payment!._id });
      expect(receipt).toBeDefined();
      expect(receipt!.amount).toBe(15000);

      // 4. Check SHEET_WRITE_BACK job queued
      const writeBackJob = await Job.findOne({
        type: 'SHEET_WRITE_BACK',
        'payload.paymentId': payment!._id.toString()
      });
      expect(writeBackJob).toBeDefined();
      expect(writeBackJob!.status).toBe('QUEUED');
    });
  });

  describe('Razorpay Webhook & Deduplication (Rules 20, 84)', () => {
    it('POST /webhooks/razorpay rejects invalid webhook signature', async () => {
      const res = await request(app)
        .post('/webhooks/razorpay')
        .set('x-razorpay-signature', 'invalid_webhook_sig')
        .send({ event: 'payment.captured' });

      expect(res.status).toBe(400);
    });

    it('POST /webhooks/razorpay safely ignores duplicate webhook events without duplicating payment', async () => {
      const webhookPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_mock_verified_888', // ALREADY CAPTURED ABOVE
              order_id: 'order_mock_123',
              amount: 1500000 // in paise (₹15,000)
            }
          }
        }
      };

      const res = await request(app)
        .post('/webhooks/razorpay')
        .set('x-razorpay-signature', 'valid_mock_webhook_signature')
        .send(webhookPayload);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('already_processed');

      // Ensure no duplicate payment record exists
      const payments = await Payment.find({ providerPaymentId: 'pay_mock_verified_888' });
      expect(payments).toHaveLength(1);
    });
  });

  describe('Controlled Sheet Write-Back Execution', () => {
    it('executes SHEET_WRITE_BACK background job and writes to source spreadsheet', async () => {
      const job = await Job.findOne({ type: 'SHEET_WRITE_BACK', status: 'QUEUED' });
      expect(job).toBeDefined();

      await processSheetWriteBackJob(job!);

      // Verify row was updated in mock sheet
      const rows = await mockAdapter.readRows('Students_Master');
      const updatedRow = rows.find((r) => r.rowReference === sampleStudent.sourceRowReference);
      expect(updatedRow).toBeDefined();
      expect(updatedRow!.values['Receipt No']).toBe(job!.payload.receiptNumber);
      expect(updatedRow!.values['Paid Amount']).toBe(job!.payload.paidAmount);
    });
  });

  afterAll(async () => {
    delete process.env.USE_MOCK_PROVIDERS;
    await disconnectDatabase();
  });
});
