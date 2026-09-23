import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { MockGoogleSheetsAdapter } from '../integrations/MockGoogleSheetsAdapter';
import { suggestMapping, validateCriticalMappings } from '../modules/sync/mappingEngine';
import { normalizePhoneNumber, validateStudentRow } from '../modules/sync/validationEngine';
import { runSync } from '../modules/sync/syncEngine';
import { resolveConflict } from '../modules/sync/conflictEngine';
import { Institution } from '../models/Institution';
import { DataConnection } from '../models/DataConnection';
import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';
import { Payment } from '../models/Payment';
import { SyncConflict } from '../models/SyncConflict';
import { User } from '../models/User';

describe('Phase 2B: Student Data Layer, Adapters & Sync Engine Tests', () => {
  let institutionId: mongoose.Types.ObjectId;
  let adminUserId: mongoose.Types.ObjectId;
  let connectionId: string;
  let mockAdapter: MockGoogleSheetsAdapter;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase();

    // Setup test institution
    await Institution.deleteMany({});
    const institution = await Institution.create({
      name: 'Test Engineering College',
      code: 'TESTCOLLEGE'
    });
    institutionId = institution._id as mongoose.Types.ObjectId;

    // Setup admin user
    await User.deleteMany({});
    const admin = await User.create({
      institutionId,
      name: 'Admin User',
      email: 'admin@test.edu',
      passwordHash: 'hash',
      role: 'ADMIN'
    });
    adminUserId = admin._id as mongoose.Types.ObjectId;

    mockAdapter = new MockGoogleSheetsAdapter();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('Validation & Normalization Engine', () => {
    it('normalizes 10-digit Indian numbers to E.164 (+91)', () => {
      expect(normalizePhoneNumber('9876543210')).toBe('+919876543210');
      expect(normalizePhoneNumber('919876543210')).toBe('+919876543210');
      expect(normalizePhoneNumber('+91 98765 43210')).toBe('+919876543210');
    });

    it('flags invalid or missing phone numbers correctly', () => {
      expect(normalizePhoneNumber('12345')).toBeNull();
      expect(normalizePhoneNumber('')).toBeNull();
      expect(normalizePhoneNumber('not_a_phone')).toBeNull();

      const invalidResult = validateStudentRow({
        externalStudentId: 'ST-01',
        name: 'Arun',
        whatsappNumber: 'invalid'
      });
      expect(invalidResult.status).toBe('INVALID');
      expect(invalidResult.issues.length).toBeGreaterThan(0);
    });
  });

  describe('Mapping Engine', () => {
    it('auto-suggests correct canonical fields from messy spreadsheet headers', () => {
      const headers = ['Register No', 'Student Name', 'Parent Mobile', 'Total Fee', 'Due Date'];
      const mapping = suggestMapping(headers);

      expect(mapping['Register No']).toBe('externalStudentId');
      expect(mapping['Student Name']).toBe('name');
      expect(mapping['Parent Mobile']).toBe('whatsappNumber');
      expect(mapping['Total Fee']).toBe('totalFee');
      expect(mapping['Due Date']).toBe('dueDate');

      const check = validateCriticalMappings(mapping);
      expect(check.valid).toBe(true);
    });
  });

  describe('Sync Engine & Batch Ingestion', () => {
    it('initializes connection and performs first batch sync of 50 students', async () => {
      await Student.deleteMany({});
      await FeeAccount.deleteMany({});
      await DataConnection.deleteMany({});

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

      const conn = await DataConnection.create({
        institutionId,
        provider: 'google_sheets',
        accountReference: 'mock_account',
        sheetReference: 'Students_Master',
        columnMapping: mapping,
        syncInterval: 60
      });
      connectionId = conn._id.toString();

      const metrics = await runSync(connectionId, mockAdapter);
      expect(metrics.rowsRead).toBe(50);
      expect(metrics.rowsAdded).toBe(50);
      expect(metrics.rowsSkipped).toBe(0);

      const studentCount = await Student.countDocuments({ institutionId });
      expect(studentCount).toBe(50);

      const feeAccountCount = await FeeAccount.countDocuments({ institutionId });
      expect(feeAccountCount).toBe(50);
    });

    it('skips unchanged rows on second sync via sourceHash comparison', async () => {
      const metrics = await runSync(connectionId, mockAdapter);
      expect(metrics.rowsRead).toBe(50);
      expect(metrics.rowsAdded).toBe(0);
      expect(metrics.rowsSkipped).toBe(50);
    });
  });

  describe('Conflict Engine & Ledger Protection', () => {
    it('detects conflict and protects application ledger when spreadsheet unexpectedly modifies paid amount', async () => {
      // Find a student from the imported list
      const student = await Student.findOne({ externalStudentId: 'ST2026-1001', institutionId });
      expect(student).toBeDefined();

      const feeAccount = await FeeAccount.findOne({ studentId: student!._id });
      expect(feeAccount).toBeDefined();

      // Record a verified captured payment in app database
      await Payment.create({
        institutionId,
        studentId: student!._id,
        feeAccountId: feeAccount!._id,
        amount: 25000,
        currency: 'INR',
        method: 'RAZORPAY',
        provider: 'RAZORPAY',
        providerPaymentId: 'pay_test_verified_123',
        status: 'CAPTURED',
        verifiedAt: new Date()
      });

      // Update feeAccount to reflect this verified payment
      feeAccount!.paidAmount = 25000;
      feeAccount!.balance = 25000;
      await feeAccount!.save();

      // Directly modify the mock spreadsheet cell to claim paid is ₹45,000 (discrepancy)
      mockAdapter.setCellDirectly('Students_Master', 'ST2026-1001', 'Paid Amount', 45000);

      // Run sync
      const metrics = await runSync(connectionId, mockAdapter);
      expect(metrics.rowsConflicted).toBeGreaterThan(0);

      // Check conflict created
      const conflict = await SyncConflict.findOne({ studentId: student!._id, status: 'OPEN' });
      expect(conflict).toBeDefined();
      expect(conflict!.field).toBe('paidAmount');
      expect(conflict!.applicationValue).toBe('₹25000');
      expect(conflict!.sourceValue).toBe('₹45000');

      // CRITICAL CHECK: The protected ledger in feeAccount was NOT overwritten!
      const reloadedFee = await FeeAccount.findById(feeAccount!._id);
      expect(reloadedFee!.paidAmount).toBe(25000);

      // Admin resolves conflict by keeping verified value
      await resolveConflict(conflict!._id.toString(), 'KEEP_VERIFIED_VALUE', adminUserId);
      const resolvedConflict = await SyncConflict.findById(conflict!._id);
      expect(resolvedConflict!.status).toBe('RESOLVED');
      expect(resolvedConflict!.resolution).toBe('KEEP_VERIFIED_VALUE');
    });
  });
});
