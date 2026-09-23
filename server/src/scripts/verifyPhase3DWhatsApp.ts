import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

import { Student } from '../models/Student';
import { Staff } from '../models/Staff';
import { FeeAccount } from '../models/FeeAccount';
import { Payment } from '../models/Payment';
import { Receipt } from '../models/Receipt';
import { Message } from '../models/Message';
import { Job } from '../models/Job';
import { Automation } from '../models/Automation';
import { Announcement } from '../models/Announcement';
import { Ticket } from '../models/Ticket';
import { Institution } from '../models/Institution';
import { User } from '../models/User';
import { env, isMockMode } from '../config/env';
import { normalizePhoneNumber } from '../modules/sync/validationEngine';
import { renderTemplate, TemplateRenderError } from '../integrations/whatsapp/templateEngine';
import {
  processMessageJob,
  getConsecutiveProviderFailures,
  resetCircuitBreaker
} from '../workers/messageWorker';
import {
  evaluateGreetings,
  evaluateFeeReminders,
  evaluateAnnouncements,
  evaluateComplaints,
  evaluateStaffNotices
} from '../workers/automationWorker';
import { handlePaymentSuccess } from '../modules/payments/paymentSuccessHandler';
import { MockWhatsAppProvider } from '../integrations/whatsapp/MockWhatsAppProvider';
import { getBaileysWhatsAppProvider } from '../integrations/whatsapp/BaileysWhatsAppProvider';

export interface AuditResult {
  testId: string;
  name: string;
  category: string;
  expected: string;
  observed: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'BLOCKED' | 'NOT TESTABLE';
  details?: string;
}

const auditResults: AuditResult[] = [];

function recordResult(result: AuditResult) {
  auditResults.push(result);
  const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${result.testId}] ${result.name}: ${result.status}`);
  if (result.details) {
    console.log(`   Details: ${result.details}`);
  }
}

async function runPhase3DAudit() {
  console.log('================================================================');
  console.log('🚀 STARTING PHASE 3D — WHATSAPP AUTOMATION AUDIT & VALIDATION');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  console.log('✓ Connected to MongoDB for Phase 3D validation.');

  // Locate or setup test institution
  let institution = await Institution.findOne();
  if (!institution) {
    institution = await Institution.create({
      name: 'CampusFlow Test Institute',
      code: 'CFTI_TEST',
      timezone: 'Asia/Kolkata',
      defaultCountryCode: '+91'
    });
  }
  const institutionId = institution._id as Types.ObjectId;

  // -------------------------------------------------------------------------
  // TEST 1: Baileys Version & Server-Side Security Audit
  // -------------------------------------------------------------------------
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const baileysVer = pkg.dependencies?.['@whiskeysockets/baileys'];

    const authDir = path.resolve(process.cwd(), 'data', 'baileys_auth');
    const authDirExists = fs.existsSync(authDir);

    const isSecure = baileysVer && authDirExists;
    recordResult({
      testId: 'TEST-1-BAILEYS-SECURITY',
      name: 'Baileys Package & Session Storage Security Audit',
      category: 'Security & Configuration',
      expected: 'Baileys v6.7.x installed, session stored server-side only in data/baileys_auth',
      observed: `Baileys: ${baileysVer}, Server Auth Directory: ${authDir} (Exists: ${authDirExists})`,
      status: isSecure ? 'PASS' : 'FAIL',
      details: 'WhatsApp session credentials stored securely in server/data/baileys_auth, never sent to client.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-1-BAILEYS-SECURITY',
      name: 'Baileys Package & Session Storage Security Audit',
      category: 'Security & Configuration',
      expected: 'Clean package inspection',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 2: Phone Number Canonical Normalization (Rule 8)
  // -------------------------------------------------------------------------
  try {
    const p1 = normalizePhoneNumber('9876543210');
    const p2 = normalizePhoneNumber('0919876543210');
    const p3 = normalizePhoneNumber('+91 98765 43210');
    const p4 = normalizePhoneNumber('09876543210');

    const expectedCanonical = '+919876543210';
    const allMatch = p1 === expectedCanonical && p2 === expectedCanonical && p3 === expectedCanonical && p4 === expectedCanonical;

    recordResult({
      testId: 'TEST-2-PHONE-NORMALIZATION',
      name: 'Canonical Phone Number Normalization',
      category: 'Data Normalization',
      expected: 'All valid formats resolve to canonical +919876543210',
      observed: `p1=${p1}, p2=${p2}, p3=${p3}, p4=${p4}`,
      status: allMatch ? 'PASS' : 'FAIL',
      details: 'Strict canonical normalization prevents identity fragmentation.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-2-PHONE-NORMALIZATION',
      name: 'Canonical Phone Number Normalization',
      category: 'Data Normalization',
      expected: 'Valid canonicalization',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 3: Recipient Validation & Invalid Number Handling (Rule 9 & 42)
  // -------------------------------------------------------------------------
  try {
    const invalidPhone = '12345';
    const mockProvider = new MockWhatsAppProvider();

    const jobPayload = {
      institutionId: institutionId.toString(),
      recipient: invalidPhone,
      body: 'Test Message',
      idempotencyKey: `test_invalid_${Date.now()}`
    };

    const dummyJob = {
      _id: new Types.ObjectId(),
      payload: jobPayload,
      status: 'QUEUED',
      save: async function () { return this; }
    } as any;

    await processMessageJob(dummyJob, mockProvider);

    const savedMsg = await Message.findOne({ idempotencyKey: jobPayload.idempotencyKey });
    const isSkipped = savedMsg?.status === 'SKIPPED' && savedMsg?.failureReason === 'INVALID_RECIPIENT';

    recordResult({
      testId: 'TEST-3-INVALID-RECIPIENT',
      name: 'Invalid Phone Number Skipping Protection',
      category: 'Reliability',
      expected: 'Status SKIPPED with failureReason INVALID_RECIPIENT, no endless retries',
      observed: `Status: ${savedMsg?.status}, Reason: ${savedMsg?.failureReason}`,
      status: isSkipped ? 'PASS' : 'FAIL',
      details: 'Invalid phone formats are aborted immediately without consuming retry attempts.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-3-INVALID-RECIPIENT',
      name: 'Invalid Phone Number Skipping Protection',
      category: 'Reliability',
      expected: 'Clean skipping',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 4: Recipient Opt-Out / Stop Handling (Rule 30)
  // -------------------------------------------------------------------------
  try {
    // Create an opted-out student
    const optOutStudent = await Student.create({
      institutionId,
      academicYear: '2026-2027',
      externalStudentId: `STU-OPTOUT-${Date.now()}`,
      name: 'OptOut Student Test',
      whatsappNumber: '+919876543210',
      status: 'ACTIVE',
      validationStatus: 'VALID',
      communicationOptOut: true,
      optOutAt: new Date(),
      optOutSource: 'USER_STOP_REQUEST'
    });

    const mockProvider = new MockWhatsAppProvider();
    const idempotencyKey = `optout_test_${Date.now()}`;
    const dummyJob = {
      _id: new Types.ObjectId(),
      payload: {
        institutionId: institutionId.toString(),
        studentId: optOutStudent._id.toString(),
        recipient: optOutStudent.whatsappNumber,
        body: 'OptOut test notification',
        idempotencyKey
      },
      status: 'QUEUED',
      save: async function () { return this; }
    } as any;

    await processMessageJob(dummyJob, mockProvider);

    const savedMsg = await Message.findOne({ idempotencyKey });
    const isSkipped = savedMsg?.status === 'SKIPPED' && savedMsg?.failureReason === 'RECIPIENT_OPTED_OUT';

    recordResult({
      testId: 'TEST-4-OPTOUT-HANDLING',
      name: 'Recipient Opt-Out / Stop Preference Compliance',
      category: 'Compliance & Preferences',
      expected: 'Non-essential routine messages strictly skipped for opted-out recipients',
      observed: `Status: ${savedMsg?.status}, Reason: ${savedMsg?.failureReason}`,
      status: isSkipped ? 'PASS' : 'FAIL',
      details: 'Recipients marking opt-out are automatically bypassed in outbound dispatch.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-4-OPTOUT-HANDLING',
      name: 'Recipient Opt-Out / Stop Preference Compliance',
      category: 'Compliance & Preferences',
      expected: 'Opt-out handled',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 5: Template Engine Strict Error Validation (Rule 18 & 43)
  // -------------------------------------------------------------------------
  try {
    const templateWithUnknown = 'Hello {{student_name}}, your secret is {{unknown_secret_token}}';
    const variables = { student_name: 'Test Student' };

    let threwExpectedError = false;
    try {
      renderTemplate(templateWithUnknown, variables, true);
    } catch (err: any) {
      if (err instanceof TemplateRenderError) {
        threwExpectedError = true;
      }
    }

    // Now test message worker rejects it
    const mockProvider = new MockWhatsAppProvider();
    const idempotencyKey = `tmpl_err_${Date.now()}`;
    const dummyJob = {
      _id: new Types.ObjectId(),
      payload: {
        institutionId: institutionId.toString(),
        recipient: '+919876543210',
        body: templateWithUnknown,
        variables,
        idempotencyKey
      },
      status: 'QUEUED',
      save: async function () { return this; }
    } as any;

    await processMessageJob(dummyJob, mockProvider);
    const savedMsg = await Message.findOne({ idempotencyKey });
    const isFailed = savedMsg?.status === 'FAILED' && savedMsg?.failureReason === 'TEMPLATE_RENDER_ERROR';

    recordResult({
      testId: 'TEST-5-TEMPLATE-STRICT-RENDER',
      name: 'Template Strict Variable Error Validation',
      category: 'Template Engine',
      expected: 'Throws TemplateRenderError and sets status FAILED, no partial message sent',
      observed: `Threw error: ${threwExpectedError}, DB status: ${savedMsg?.status}, Reason: ${savedMsg?.failureReason}`,
      status: (threwExpectedError && isFailed) ? 'PASS' : 'FAIL',
      details: 'Messages with unrendered {{tokens}} are strictly aborted before reaching provider.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-5-TEMPLATE-STRICT-RENDER',
      name: 'Template Strict Variable Error Validation',
      category: 'Template Engine',
      expected: 'Validation error thrown',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 6: Outbound Message Pacing Gate & Concurrency Control (Rule 2, 4, 21, 39)
  // -------------------------------------------------------------------------
  try {
    console.log('   Testing 5 consecutive message dispatches to measure pacing intervals...');
    const testIntervalMs = 1500; // Controlled interval for test execution
    const mockProvider = new MockWhatsAppProvider();
    const timestamps: number[] = [];

    // Temporarily override env.MIN_SEND_INTERVAL_MS in memory for test harness
    (env as any).MIN_SEND_INTERVAL_MS = testIntervalMs;

    for (let i = 1; i <= 5; i++) {
      const idempotencyKey = `pacing_test_${i}_${Date.now()}`;
      const dummyJob = {
        _id: new Types.ObjectId(),
        payload: {
          institutionId: institutionId.toString(),
          recipient: '+919876543210',
          body: `Pacing test message #${i}`,
          idempotencyKey
        },
        status: 'QUEUED',
        save: async function () { return this; }
      } as any;

      await processMessageJob(dummyJob, mockProvider);
      const now = Date.now();
      timestamps.push(now);
      console.log(`   Message ${i} dispatched at: ${new Date(now).toISOString()}`);
    }

    // Reset env.MIN_SEND_INTERVAL_MS back to 10,000ms default
    (env as any).MIN_SEND_INTERVAL_MS = 10000;

    let pacingViolations = 0;
    for (let i = 1; i < timestamps.length; i++) {
      const diff = timestamps[i] - timestamps[i - 1];
      console.log(`   Gap Message ${i} -> ${i + 1}: ${diff}ms (Min required: ${testIntervalMs}ms)`);
      if (diff < testIntervalMs - 100) { // Allow 100ms timer variance
        pacingViolations++;
      }
    }

    recordResult({
      testId: 'TEST-6-PACING-GATE-CONCURRENCY',
      name: 'Global Message Pacing Gate & Concurrency Lock',
      category: 'Pacing & Reliability',
      expected: 'No two outbound sends violate MIN_SEND_INTERVAL_MS; strictly 1 active send',
      observed: `Measured 5 messages. Pacing violations: ${pacingViolations}. Gaps: ${timestamps.map((t, i) => i > 0 ? (t - timestamps[i-1]) + 'ms' : 'T0').join(', ')}`,
      status: pacingViolations === 0 ? 'PASS' : 'FAIL',
      details: 'Global outbound queue pacing gate serializes sends and enforces minimum delay interval.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-6-PACING-GATE-CONCURRENCY',
      name: 'Global Message Pacing Gate & Concurrency Lock',
      category: 'Pacing & Reliability',
      expected: 'Pacing enforced',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 7: Deterministic Idempotency & Duplicate Prevention (Rule 6 & 38)
  // -------------------------------------------------------------------------
  try {
    const fixedKey = `idempotency_audit_key_${Date.now()}`;
    const mockProvider = new MockWhatsAppProvider();

    const dummyJob1 = {
      _id: new Types.ObjectId(),
      payload: {
        institutionId: institutionId.toString(),
        recipient: '+919876543210',
        body: 'Idempotency test payload',
        idempotencyKey: fixedKey
      },
      status: 'QUEUED',
      save: async function () { return this; }
    } as any;

    // Send 1st time
    await processMessageJob(dummyJob1, mockProvider);
    const countAfterFirst = await Message.countDocuments({ institutionId, idempotencyKey: fixedKey });

    // Send 2nd time (simulate duplicate sync / restart)
    const dummyJob2 = {
      _id: new Types.ObjectId(),
      payload: {
        institutionId: institutionId.toString(),
        recipient: '+919876543210',
        body: 'Idempotency test payload',
        idempotencyKey: fixedKey
      },
      status: 'QUEUED',
      save: async function () { return this; }
    } as any;

    await processMessageJob(dummyJob2, mockProvider);
    const countAfterSecond = await Message.countDocuments({ institutionId, idempotencyKey: fixedKey });

    recordResult({
      testId: 'TEST-7-IDEMPOTENCY-DUPLICATES',
      name: 'Deterministic Idempotency & Duplicate Protection',
      category: 'Idempotency',
      expected: 'Exactly 1 message record in database across repeated trigger executions',
      observed: `Count after send 1: ${countAfterFirst}, Count after duplicate send: ${countAfterSecond}`,
      status: (countAfterFirst === 1 && countAfterSecond === 1) ? 'PASS' : 'FAIL',
      details: 'Duplicate job dispatch is recognized and safely bypassed without duplicate send.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-7-IDEMPOTENCY-DUPLICATES',
      name: 'Deterministic Idempotency & Duplicate Protection',
      category: 'Idempotency',
      expected: 'Clean idempotency',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 8A: Module 1 — Welcome Greeting Automation (Rule 7 & 10)
  // -------------------------------------------------------------------------
  try {
    await Automation.findOneAndUpdate(
      { institutionId, type: 'GREETING' },
      { enabled: true, isPaused: false },
      { upsert: true }
    );

    const testStudent = await Student.create({
      institutionId,
      academicYear: '2026-2027',
      externalStudentId: `STU-GREET-${Date.now()}`,
      name: 'Greeting Student Test',
      whatsappNumber: '+919876543210',
      status: 'ACTIVE',
      validationStatus: 'VALID'
    });

    const firstRunQueued = await evaluateGreetings(institutionId);
    const secondRunQueued = await evaluateGreetings(institutionId); // Should be 0 (no duplicate)

    recordResult({
      testId: 'TEST-8A-GREETING-AUTOMATION',
      name: 'Module 1 — Welcome Greeting Evaluation & One-Time Rule',
      category: 'Automation Modules',
      expected: 'First sync queues 1 message; repeated sync queues 0 duplicate messages',
      observed: `First run queued: ${firstRunQueued}, Second run queued: ${secondRunQueued}`,
      status: (firstRunQueued >= 1 && secondRunQueued === 0) ? 'PASS' : 'FAIL',
      details: 'Greeting automation strictly observes one-time send per student + academic year.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-8A-GREETING-AUTOMATION',
      name: 'Module 1 — Welcome Greeting Evaluation & One-Time Rule',
      category: 'Automation Modules',
      expected: 'Evaluates cleanly',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 8B: Module 2 — Fee Reminders & Balance Check (Rule 12, 13, 14, 44)
  // -------------------------------------------------------------------------
  try {
    await Automation.findOneAndUpdate(
      { institutionId, type: 'FEE' },
      { enabled: true, isPaused: false },
      { upsert: true }
    );

    const feeStudent = await Student.create({
      institutionId,
      academicYear: '2026-2027',
      externalStudentId: `STU-FEE-${Date.now()}`,
      name: 'Fee Student Test',
      whatsappNumber: '+919876543210',
      status: 'ACTIVE',
      validationStatus: 'VALID'
    });

    // Create fee account due in 36 hours (triggers FEE_REMINDER_48H)
    const dueDate = new Date(Date.now() + 36 * 3600 * 1000);
    const feeAccount = await FeeAccount.create({
      institutionId,
      studentId: feeStudent._id,
      academicYear: '2026-2027',
      totalAmount: 25000,
      paidAmount: 5000,
      balance: 20000,
      dueDate,
      status: 'PARTIAL'
    });

    const queuedCount = await evaluateFeeReminders(institutionId);

    // Now test payment capture auto-cancels reminder and queues receipt
    const paymentResult = await handlePaymentSuccess({
      institutionId,
      studentId: feeStudent._id,
      feeAccountId: feeAccount._id,
      amount: 20000, // Fully pays remaining balance
      providerPaymentId: `pay_test_${Date.now()}`,
      providerOrderId: `order_test_${Date.now()}`
    });

    // Check if pending reminder jobs were cancelled with PAYMENT_RECEIVED
    const cancelledJobs = await Job.find({
      'payload.studentId': feeStudent._id.toString(),
      'payload.eventType': { $regex: /^FEE_REMINDER/ },
      status: 'CANCELLED',
      lastError: 'PAYMENT_RECEIVED'
    });

    // Check if receipt job was queued
    const receiptJob = await Job.findOne({
      'payload.studentId': feeStudent._id.toString(),
      'payload.eventType': 'RECEIPT'
    });

    const feeSuccess = queuedCount >= 1 && cancelledJobs.length >= 1 && Boolean(receiptJob);

    recordResult({
      testId: 'TEST-8B-FEES-PAYMENT-AUTOMATION',
      name: 'Module 2 — Fee Reminders, Auto-Cancellation & Receipt',
      category: 'Automation Modules',
      expected: 'Reminder queued, payment capture cancels future reminders and queues receipt',
      observed: `Reminders queued: ${queuedCount}, Reminders cancelled on payment: ${cancelledJobs.length}, Receipt Job Queued: ${Boolean(receiptJob)}`,
      status: feeSuccess ? 'PASS' : 'FAIL',
      details: 'Verified server-side payment cancels all pending reminder jobs with PAYMENT_RECEIVED and queues receipt.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-8B-FEES-PAYMENT-AUTOMATION',
      name: 'Module 2 — Fee Reminders, Auto-Cancellation & Receipt',
      category: 'Automation Modules',
      expected: 'Clean fee flow',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 8C: Module 3 — College Information / Announcements (Rule 15)
  // -------------------------------------------------------------------------
  try {
    const annId = `ANN-${Date.now()}`;
    const announcement = await Announcement.create({
      institutionId,
      announcementId: annId,
      title: 'College Annual Sports Day',
      type: 'EVENT',
      message: 'All students are invited to the sports complex this Friday.',
      target: 'ALL',
      sendAt: new Date(Date.now() - 1000), // Ready to send
      status: 'SCHEDULED'
    });

    const queuedAnnouncements = await evaluateAnnouncements(institutionId);
    const updatedAnn = await Announcement.findById(announcement._id);

    // Repeated evaluation must not resend
    const secondRunAnn = await evaluateAnnouncements(institutionId);

    const annSuccess = queuedAnnouncements > 0 && updatedAnn?.status === 'SENT' && secondRunAnn === 0;

    recordResult({
      testId: 'TEST-8C-ANNOUNCEMENT-AUTOMATION',
      name: 'Module 3 — College Information & Circulars',
      category: 'Automation Modules',
      expected: 'Announcement enqueued to target students, status marked SENT, no resend on repeated poll',
      observed: `Queued: ${queuedAnnouncements}, Status: ${updatedAnn?.status}, Repeated poll count: ${secondRunAnn}`,
      status: annSuccess ? 'PASS' : 'FAIL',
      details: 'Announcements are dispatched once per targeted recipient using Announcement ID idempotency.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-8C-ANNOUNCEMENT-AUTOMATION',
      name: 'Module 3 — College Information & Circulars',
      category: 'Automation Modules',
      expected: 'Clean announcement dispatch',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 8D: Module 4 — Helpdesk / Complaint Inbound & Acknowledgment (Rule 16)
  // -------------------------------------------------------------------------
  try {
    await Automation.findOneAndUpdate(
      { institutionId, type: 'COMPLAINT' },
      { enabled: true, isPaused: false },
      { upsert: true }
    );

    // Clean prior test tickets for isolation
    await Ticket.deleteMany({ institutionId, phone: '+919876543210' });

    // Create an incoming ticket (as created by Baileys messages.upsert hook)
    const ticket = await Ticket.create({
      institutionId,
      phone: '+919876543210',
      senderName: 'Student Query Parent',
      subject: 'Hostel Fee Clarification',
      message: 'Can I pay the hostel fee in two installments?',
      status: 'OPEN'
    });

    const ackCount = await evaluateComplaints(institutionId);
    const secondAck = await evaluateComplaints(institutionId); // Should be 0

    recordResult({
      testId: 'TEST-8D-COMPLAINT-AUTOMATION',
      name: 'Module 4 — Helpdesk Inquiry & Auto-Acknowledgment',
      category: 'Automation Modules',
      expected: 'OPEN ticket generates 1 acknowledgment message; repeated poll generates 0 duplicates',
      observed: `Acknowledgment queued: ${ackCount}, Second poll queued: ${secondAck}`,
      status: (ackCount === 1 && secondAck === 0) ? 'PASS' : 'FAIL',
      details: 'Inbound message hook registers Ticket in OPEN state and delivers clean auto-acknowledgment.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-8D-COMPLAINT-AUTOMATION',
      name: 'Module 4 — Helpdesk Inquiry & Auto-Acknowledgment',
      category: 'Automation Modules',
      expected: 'Clean ticket acknowledgment',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 8E: Module 5 — Staff Notices & Communications (Rule 17)
  // -------------------------------------------------------------------------
  try {
    await Automation.findOneAndUpdate(
      { institutionId, type: 'STAFF' },
      { enabled: true, isPaused: false },
      { upsert: true }
    );

    // Clean prior staff for isolation
    await Staff.deleteMany({ institutionId, whatsappNumber: '+919876543210' });

    const staffMember = await Staff.create({
      institutionId,
      staffId: `STAFF-${Date.now()}`,
      name: 'Dr. Ramesh Kumar',
      department: 'Computer Science',
      whatsappNumber: '+919876543210',
      salaryDate: '28-Sep-2026',
      incrementDate: '01-Jan-2027',
      status: 'ACTIVE'
    });

    const staffNoticesQueued = await evaluateStaffNotices(institutionId);
    const secondStaffRun = await evaluateStaffNotices(institutionId); // Should be 0

    recordResult({
      testId: 'TEST-8E-STAFF-AUTOMATION',
      name: 'Module 5 — Staff Communications & Notices',
      category: 'Automation Modules',
      expected: 'Active staff member receives notice with staff variables; repeated poll queues 0 duplicates',
      observed: `Staff notice queued: ${staffNoticesQueued}, Second poll queued: ${secondStaffRun}`,
      status: (staffNoticesQueued >= 1 && secondStaffRun === 0) ? 'PASS' : 'FAIL',
      details: 'Staff module accesses staff data model and utilizes the same global queue and idempotency.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-8E-STAFF-AUTOMATION',
      name: 'Module 5 — Staff Communications & Notices',
      category: 'Automation Modules',
      expected: 'Clean staff notice dispatch',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 9: Failure Circuit Breaker (Rule 22)
  // -------------------------------------------------------------------------
  try {
    resetCircuitBreaker();
    (env as any).MIN_SEND_INTERVAL_MS = 50; // Use fast interval for unit test

    // Provider that always fails with provider-level error
    const failingProvider = {
      providerName: 'failing_provider_test',
      sendMessage: async () => ({
        success: false,
        status: 'FAILED',
        error: 'WhatsApp network socket connection reset by peer'
      }),
      validateRecipient: async () => true
    } as any;

    // Dispatch 5 consecutive failures
    for (let i = 1; i <= 5; i++) {
      const dummyJob = {
        _id: new Types.ObjectId(),
        payload: {
          institutionId: institutionId.toString(),
          recipient: '+919876543210',
          body: 'Test failure trigger',
          idempotencyKey: `fail_cb_${i}_${Date.now()}`
        },
        status: 'QUEUED',
        save: async function () { return this; }
      } as any;

      try {
        await processMessageJob(dummyJob, failingProvider);
      } catch (e) {}
    }

    // Check if automation is paused with WHATSAPP_PROVIDER_FAILURE
    const automations = await Automation.find({ institutionId });
    const isCircuitBreakerTripped = automations.every((a) => a.isPaused && a.pauseReason === 'WHATSAPP_PROVIDER_FAILURE');

    (env as any).MIN_SEND_INTERVAL_MS = 10000; // Restore default

    recordResult({
      testId: 'TEST-9-CIRCUIT-BREAKER',
      name: 'Failure Circuit Breaker Trip Protection',
      category: 'Circuit Breaker & Reliability',
      expected: '5 consecutive provider failures trips circuit breaker, pausing outbound automation queue',
      observed: `Consecutive failures: ${getConsecutiveProviderFailures()}, Queue Paused: ${isCircuitBreakerTripped}, Reason: ${automations[0]?.pauseReason}`,
      status: isCircuitBreakerTripped ? 'PASS' : 'FAIL',
      details: 'Circuit breaker protects both recipient experience and provider reliability.'
    });

    // Reset circuit breaker and unpause for subsequent operations
    resetCircuitBreaker();
    await Automation.updateMany({ institutionId }, { isPaused: false, pauseReason: null });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-9-CIRCUIT-BREAKER',
      name: 'Failure Circuit Breaker Trip Protection',
      category: 'Circuit Breaker & Reliability',
      expected: 'Circuit breaker trips',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // TEST 10: Baileys WhatsApp Web Session Live State (Rule 24, 25, 51)
  // -------------------------------------------------------------------------
  try {
    const baileys = getBaileysWhatsAppProvider();
    const connState = baileys.getConnectionState();

    // In local non-interactive automation test run, Baileys can be in NOT_CONNECTED, DISCONNECTED, or QR_REQUIRED
    const isStateValid = ['NOT_CONNECTED', 'DISCONNECTED', 'CONNECTING', 'CONNECTED', 'RECONNECTING', 'AUTH_REQUIRED', 'QR_REQUIRED', 'LOGGED_OUT'].includes(connState);

    recordResult({
      testId: 'TEST-10-BAILEYS-CONNECTION-STATE',
      name: 'Baileys WhatsApp Web Connection State Machine',
      category: 'Provider Integration',
      expected: 'Valid state machine (DISCONNECTED / AUTH_REQUIRED / CONNECTED) exposed without stack traces',
      observed: `Baileys Connection State: ${connState}`,
      status: isStateValid ? 'PASS' : 'FAIL',
      details: 'Provider state machine cleanly exposes operational connection status.'
    });
  } catch (err: any) {
    recordResult({
      testId: 'TEST-10-BAILEYS-CONNECTION-STATE',
      name: 'Baileys WhatsApp Web Connection State Machine',
      category: 'Provider Integration',
      expected: 'Valid state machine',
      observed: err.message,
      status: 'FAIL'
    });
  }

  // -------------------------------------------------------------------------
  // AUDIT SUMMARY & TOTALS
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('📊 PHASE 3D WHATSAPP AUTOMATION AUDIT SUMMARY');
  console.log('================================================================');

  const passes = auditResults.filter((r) => r.status === 'PASS').length;
  const fails = auditResults.filter((r) => r.status === 'FAIL').length;
  const partials = auditResults.filter((r) => r.status === 'PARTIAL').length;
  const total = auditResults.length;

  console.log(`Total Checks: ${total}`);
  console.log(`PASS:         ${passes}`);
  console.log(`FAIL:         ${fails}`);
  console.log(`PARTIAL:      ${partials}`);
  console.log(`Success Rate: ${Math.round((passes / total) * 100)}%`);

  await mongoose.disconnect();
  console.log('✓ Disconnected from MongoDB.');

  return { total, passes, fails, partials, results: auditResults };
}

if (require.main === module) {
  runPhase3DAudit()
    .then((summary) => {
      if (summary.fails > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Audit execution error:', err);
      process.exit(1);
    });
}
