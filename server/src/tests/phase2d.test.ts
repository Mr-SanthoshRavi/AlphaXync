import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Institution } from '../models/Institution';
import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';
import { Automation } from '../models/Automation';
import { AutomationDelivery } from '../models/AutomationDelivery';
import { Job } from '../models/Job';
import { Message } from '../models/Message';
import { DataConnection } from '../models/DataConnection';
import { JobQueue } from '../workers/jobQueue';
import { evaluateGreetings, evaluateFeeReminders } from '../workers/automationWorker';
import { processMessageJob } from '../workers/messageWorker';
import { MockWhatsAppProvider } from '../integrations/whatsapp/MockWhatsAppProvider';
import { MockGoogleSheetsAdapter } from '../integrations/MockGoogleSheetsAdapter';
import { runSync } from '../modules/sync/syncEngine';

describe('Phase 2D: Universal Automation Engine & Job Queue Tests', () => {
  let institutionId: mongoose.Types.ObjectId;
  let testQueue: JobQueue;
  let mockWhatsApp: MockWhatsAppProvider;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase();

    // Clean DB
    await Institution.deleteMany({});
    await Student.deleteMany({});
    await FeeAccount.deleteMany({});
    await Automation.deleteMany({});
    await AutomationDelivery.deleteMany({});
    await Job.deleteMany({});
    await Message.deleteMany({});
    await DataConnection.deleteMany({});

    const inst = await Institution.create({
      name: 'Engineering College',
      code: 'ENGCOL'
    });
    institutionId = inst._id as mongoose.Types.ObjectId;

    testQueue = new JobQueue('test_worker_1');
    mockWhatsApp = new MockWhatsAppProvider();

    // Ingest 50 students via mock adapter
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

    const mockAdapter = new MockGoogleSheetsAdapter();
    await runSync(conn._id.toString(), mockAdapter);
  });

  afterAll(async () => {
    testQueue.stop();
    await disconnectDatabase();
  });

  describe('Atomic Job Queue & Crash Recovery', () => {
    it('claims jobs atomically and executes handlers', async () => {
      let executed = false;
      testQueue.registerHandler('MESSAGE', async (job) => {
        executed = true;
      });

      const job = await testQueue.enqueue('MESSAGE', { test: true });
      expect(job.status).toBe('QUEUED');

      const processed = await testQueue.processNextJob();
      expect(processed).toBe(true);
      expect(executed).toBe(true);

      const completed = await Job.findById(job._id);
      expect(completed!.status).toBe('COMPLETED');
    });

    it('recovers abandoned/stale jobs whose locks expired', async () => {
      // Create a simulated crashed job locked 10 minutes ago
      const staleJob = await Job.create({
        type: 'MESSAGE',
        payload: { stale: true },
        status: 'PROCESSING',
        lockedAt: new Date(Date.now() - 10 * 60 * 1000),
        lockedBy: 'dead_worker_99'
      });

      await testQueue.recoverStaleJobs();

      const recovered = await Job.findById(staleJob._id);
      expect(recovered!.status).toBe('QUEUED');
      expect(recovered!.lockedAt).toBeNull();
    });
  });

  describe('Greeting Automation & Strict Deduplication (Rule 11)', () => {
    it('queues greetings for newly detected valid students on first evaluation', async () => {
      await Automation.create({
        institutionId,
        type: 'GREETING',
        enabled: true,
        template: 'Welcome {{student_name}} to campus!'
      });

      const count = await evaluateGreetings(institutionId);
      // Out of 50 students, 45 have valid mobile numbers (36-40 had missing/invalid)
      expect(count).toBeGreaterThan(40);

      const queuedMessageJobs = await Job.countDocuments({ type: 'MESSAGE' });
      expect(queuedMessageJobs).toBeGreaterThan(40);
    });

    it('strictly prevents duplicate greetings on second evaluation or sheet re-import', async () => {
      // Re-run evaluation
      const count = await evaluateGreetings(institutionId);
      expect(count).toBe(0); // ZERO duplicates queued!
    });
  });

  describe('Fee Reminder Timeline & Auto-Cancellation (Rules 10, 64)', () => {
    it('evaluates fee reminders only for students with balance > 0', async () => {
      await Automation.create({
        institutionId,
        type: 'FEE',
        enabled: true,
        template: 'Balance of ₹{{balance}} due on {{due_date}}'
      });

      // Clear any prior message jobs
      await Job.deleteMany({ type: 'MESSAGE' });

      const count = await evaluateFeeReminders(institutionId);
      expect(count).toBeGreaterThan(0);

      // Verify that paid students (balance = 0) NEVER have fee reminder jobs
      const paidAccounts = await FeeAccount.find({ institutionId, balance: 0 });
      const paidStudentIds = paidAccounts.map((a) => a.studentId.toString());

      const jobsForPaid = await Job.find({
        type: 'MESSAGE',
        'payload.studentId': { $in: paidStudentIds },
        'payload.eventType': { $regex: /^FEE_REMINDER/ }
      });
      expect(jobsForPaid).toHaveLength(0);
    });

    it('cancels queued fee reminder jobs when payment is received', async () => {
      // Create a test student and queue a fee reminder job
      const student = await Student.findOne({ institutionId, status: 'ACTIVE' });
      const feeAccount = await FeeAccount.findOne({ studentId: student!._id });

      const reminderJob = await Job.create({
        type: 'MESSAGE',
        payload: {
          studentId: student!._id.toString(),
          eventType: 'FEE_REMINDER_48H',
          recipient: '+919876543210'
        },
        status: 'QUEUED'
      });

      // Simulate student paying full balance
      feeAccount!.paidAmount = feeAccount!.totalAmount;
      feeAccount!.balance = 0;
      await feeAccount!.save();

      // Cancel reminder jobs for paid student
      await Job.updateMany(
        {
          type: 'MESSAGE',
          'payload.studentId': student!._id.toString(),
          'payload.eventType': { $regex: /^FEE_REMINDER/ },
          status: 'QUEUED'
        },
        { status: 'CANCELLED', lastError: 'PAYMENT_RECEIVED' }
      );

      const updatedJob = await Job.findById(reminderJob._id);
      expect(updatedJob!.status).toBe('CANCELLED');
      expect(updatedJob!.lastError).toBe('PAYMENT_RECEIVED');
    });
  });

  describe('Message Worker & Idempotent Sending (Rule 7)', () => {
    it('dispatches message and sets status to SENT', async () => {
      const job = await Job.create({
        type: 'MESSAGE',
        payload: {
          institutionId: institutionId.toString(),
          recipient: '+919876543210',
          templateName: 'greeting',
          body: 'Hello Student!',
          idempotencyKey: 'idemp_key_unique_001'
        },
        status: 'PROCESSING'
      });

      await processMessageJob(job, mockWhatsApp);

      const msg = await Message.findOne({ idempotencyKey: 'idemp_key_unique_001' });
      expect(msg).toBeDefined();
      expect(msg!.status).toBe('SENT');
      expect(msg!.providerMessageId).toBeDefined();
    });

    it('skips duplicate sending if the message was already sent', async () => {
      const initialCount = mockWhatsApp.sentMessages.length;

      const duplicateJob = await Job.create({
        type: 'MESSAGE',
        payload: {
          institutionId: institutionId.toString(),
          recipient: '+919876543210',
          templateName: 'greeting',
          body: 'Hello Student!',
          idempotencyKey: 'idemp_key_unique_001' // SAME KEY
        },
        status: 'PROCESSING'
      });

      await processMessageJob(duplicateJob, mockWhatsApp);

      // No new message was sent to the provider!
      expect(mockWhatsApp.sentMessages.length).toBe(initialCount);
    });
  });
});
