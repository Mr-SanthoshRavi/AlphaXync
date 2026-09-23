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
import { DataConnection } from '../models/DataConnection';
import { Job } from '../models/Job';
import { signAccessToken } from '../middleware/auth';
import { MockGoogleSheetsAdapter } from '../integrations/MockGoogleSheetsAdapter';
import { runSync } from '../modules/sync/syncEngine';

describe('Phase 2C: Admin & Cashier APIs Tests', () => {
  let app: ReturnType<typeof createApp>;
  let institutionId: mongoose.Types.ObjectId;
  let adminToken: string;
  let cashierToken: string;
  let sampleStudentId: string;
  let sampleFeeAccountId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase();
    app = createApp();

    // Clean DB
    await Institution.deleteMany({});
    await User.deleteMany({});
    await Student.deleteMany({});
    await FeeAccount.deleteMany({});
    await Payment.deleteMany({});
    await DataConnection.deleteMany({});
    await Job.deleteMany({});

    // 1. Create Institution
    const institution = await Institution.create({
      name: "St. Xavier's Engineering College",
      code: 'STXAVIER'
    });
    institutionId = institution._id as mongoose.Types.ObjectId;

    // 2. Create Admin & Cashier Users
    const adminUser = await User.create({
      institutionId,
      name: 'Dr. Ramanathan (Admin)',
      email: 'admin@stxavier.edu',
      passwordHash: 'hash',
      role: 'ADMIN'
    });

    const cashierUser = await User.create({
      institutionId,
      name: 'Cashier Desk 04',
      email: 'cashier@stxavier.edu',
      passwordHash: 'hash',
      role: 'CASHIER'
    });

    adminToken = signAccessToken({
      userId: adminUser._id.toString(),
      institutionId: institutionId.toString(),
      role: 'ADMIN',
      email: adminUser.email
    });

    cashierToken = signAccessToken({
      userId: cashierUser._id.toString(),
      institutionId: institutionId.toString(),
      role: 'CASHIER',
      email: cashierUser.email
    });

    // 3. Create Connection & Ingest Students via Mock Sheet
    const conn = await DataConnection.create({
      institutionId,
      provider: 'google_sheets',
      accountReference: 'mock_account',
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

    const mockAdapter = new MockGoogleSheetsAdapter();
    await runSync(conn._id.toString(), mockAdapter);

    // Pick a sample student
    const sample = await Student.findOne({ institutionId }).lean();
    sampleStudentId = sample!._id.toString();

    const sampleFee = await FeeAccount.findOne({ studentId: sample!._id }).lean();
    sampleFeeAccountId = sampleFee!._id.toString();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('Dashboard API', () => {
    it('GET /api/dashboard/summary returns operational cards and overview', async () => {
      const res = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cards.totalStudents).toBe(50);
      expect(res.body.data.paymentOverview).toBeDefined();
      expect(res.body.data.needsAttention).toBeInstanceOf(Array);
      expect(res.body.data.syncHealth.status).toBe('CONNECTED');
    });
  });

  describe('Students API', () => {
    it('GET /api/students returns paginated students list', async () => {
      const res = await request(app)
        .get('/api/students?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.students).toHaveLength(10);
      expect(res.body.data.pagination.total).toBe(50);
      expect(res.body.data.students[0].fee).toBeDefined();
    });

    it('GET /api/students/:id returns full detail drawer payload', async () => {
      const res = await request(app)
        .get(`/api/students/${sampleStudentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.student.id).toBe(sampleStudentId);
      expect(res.body.data.feeSummary).toBeDefined();
      expect(res.body.data.paymentHistory).toBeInstanceOf(Array);
      expect(res.body.data.messageHistory).toBeInstanceOf(Array);
    });
  });

  describe('Fees & Protected Payments API', () => {
    it('GET /api/fees lists fee ledger items', async () => {
      const res = await request(app)
        .get('/api/fees')
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.fees.length).toBeGreaterThan(0);
      expect(res.body.data.fees[0].total).toBeGreaterThan(0);
    });

    it('POST /api/payments/offline records cashier offline payment and recalculates balance server-side', async () => {
      const feeBefore = await FeeAccount.findById(sampleFeeAccountId);
      const initialBalance = feeBefore!.balance;

      const res = await request(app)
        .post('/api/payments/offline')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          studentId: sampleStudentId,
          feeAccountId: sampleFeeAccountId,
          amount: 5000,
          method: 'CASH',
          reference: 'CHQ-2026-991',
          note: 'Counter payment fee balance'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.payment.receiptNumber).toMatch(/^REC-2026-\d{6}$/);
      expect(res.body.data.feeSummary.paidAmount).toBe(feeBefore!.paidAmount + 5000);
      expect(res.body.data.feeSummary.balance).toBe(initialBalance - 5000);

      // Verify write-back job was created
      const job = await Job.findOne({ type: 'SHEET_WRITE_BACK', status: 'QUEUED' });
      expect(job).toBeDefined();
      expect(job!.payload.receiptNumber).toBe(res.body.data.payment.receiptNumber);
    });

    it('POST /api/payments/request generates secure payment intent token', async () => {
      const res = await request(app)
        .post('/api/payments/request')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          studentId: sampleStudentId,
          feeAccountId: sampleFeeAccountId
        });

      expect(res.status).toBe(201);
      expect(res.body.data.paymentToken).toBeDefined();
      expect(res.body.data.paymentUrl).toMatch(/^\/pay\/[a-f0-9]{64}$/);
    });

    it('rejects fee adjustments by Cashier (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/payments/adjust-fee')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          feeAccountId: sampleFeeAccountId,
          newTotalAmount: 60000,
          reason: 'Cashier trying to adjust fee'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows fee adjustments by Admin and updates balance', async () => {
      const res = await request(app)
        .post('/api/payments/adjust-fee')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          feeAccountId: sampleFeeAccountId,
          newTotalAmount: 60000,
          reason: 'Authorized lab fee adjustment'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.totalAmount).toBe(60000);
    });
  });

  describe('Automations & Settings APIs', () => {
    it('GET /api/automations lists all 5 modules', async () => {
      const res = await request(app)
        .get('/api/automations')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(5);
    });

    it('PATCH /api/automations/GREETING/toggle toggles automation status', async () => {
      const res = await request(app)
        .patch('/api/automations/GREETING/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body.data.enabled).toBe(true);
    });

    it('GET /api/settings returns masked credentials without secret leakage', async () => {
      const res = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.connections.razorpay.keyIdMasked).toContain('••••');
      expect(res.body.data.connections.whatsapp.phoneNumberMasked).toContain('••••');
      expect(res.body.data.connections.razorpay.keySecret).toBeUndefined();
    });
  });
});
