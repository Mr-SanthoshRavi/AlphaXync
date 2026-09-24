import { Types } from 'mongoose';
import { Automation } from '../models/Automation';
import { AutomationDelivery } from '../models/AutomationDelivery';
import { Student } from '../models/Student';
import { Staff } from '../models/Staff';
import { FeeAccount } from '../models/FeeAccount';
import { Announcement } from '../models/Announcement';
import { Ticket } from '../models/Ticket';
import { Job } from '../models/Job';
import { Institution } from '../models/Institution';
import { PaymentIntent } from '../models/PaymentIntent';
import { generateSecureToken } from '../utils/crypto';
import { logger } from '../utils/logger';
import { normalizePhoneNumber } from '../modules/sync/validationEngine';

/**
 * 1. GREETING AUTOMATION
 * Trigger: New valid student detected from Google Sheets / Excel sync
 */
export async function evaluateGreetings(institutionId: Types.ObjectId): Promise<number> {
  const automation = await Automation.findOne({ institutionId, type: 'GREETING', enabled: true });
  if (!automation || automation.isPaused) return 0;

  // 1. Fetch active valid students who have not opted out and have a valid WhatsApp number
  const eligibleStudents = await Student.find({
    institutionId,
    status: 'ACTIVE',
    validationStatus: { $in: ['VALID', 'WARNING'] },
    whatsappNumber: { $exists: true, $ne: '', $regex: /^\+[1-9]\d{9,14}$/ },
    communicationOptOut: { $ne: true }
  });

  let queuedCount = 0;

  for (const student of eligibleStudents) {
    // 2. Strict Delivery Check (Rule 7 & 10: One-time send per student + academic year)
    const alreadyDelivered = await AutomationDelivery.findOne({
      institutionId,
      automationId: automation._id,
      studentId: student._id,
      academicYear: student.academicYear,
      eventType: 'GREETING'
    });

    if (alreadyDelivered) {
      continue; // Strictly skip, never duplicate
    }

    const idempotencyKey = `greeting_${institutionId}_${student._id}_${student.academicYear}`;

    // 3. Mark delivery record before/atomic with queueing
    await AutomationDelivery.create({
      institutionId,
      automationId: automation._id,
      studentId: student._id,
      academicYear: student.academicYear,
      eventType: 'GREETING',
      deliveredAt: new Date()
    });

    const inst = await Institution.findById(institutionId);
    const collegeName = inst?.name || 'AlphaXync Educational Institution';

    const variables: Record<string, string> = {
      student_name: student.name,
      father_name: student.fatherName || 'Parent',
      college_name: collegeName,
      course: student.course || 'Undergraduate Course',
      year: student.year ? `${student.year} Year` : '1st Year'
    };

    const template = automation.template || 'Hello {{student_name}} 👋\nWelcome to {{college_name}}.\nDear Parent: {{father_name}}\nWe will use this WhatsApp number for important college updates.';

    // 4. Enqueue to Global WhatsApp Outbound Queue
    await Job.create({
      type: 'MESSAGE',
      payload: {
        institutionId: institutionId.toString(),
        studentId: student._id.toString(),
        automationId: automation._id.toString(),
        recipient: student.whatsappNumber,
        templateName: 'student_greeting',
        body: template,
        variables,
        idempotencyKey,
        eventType: 'GREETING',
        source: 'AUTOMATION'
      },
      status: 'QUEUED',
      runAt: new Date()
    });

    queuedCount++;
  }

  if (queuedCount > 0) {
    logger.info('GREETING_AUTOMATION_EVALUATED', `Queued greetings for ${queuedCount} newly eligible students`);
  }

  return queuedCount;
}

/**
 * 2. FEE & PAYMENT REMINDERS AUTOMATION
 * Dynamic balance re-check before scheduling; cancelled upon payment
 */
export async function evaluateFeeReminders(institutionId: Types.ObjectId): Promise<number> {
  const automation = await Automation.findOne({ institutionId, type: 'FEE', enabled: true });
  if (!automation || automation.isPaused) return 0;

  const now = new Date();
  const pendingAccounts = await FeeAccount.find({
    institutionId,
    balance: { $gt: 0 }
  }).populate('studentId');

  let queuedCount = 0;

  for (const account of pendingAccounts) {
    const student = account.studentId as any;
    if (
      !student ||
      student.status !== 'ACTIVE' ||
      student.validationStatus === 'INVALID' ||
      !student.whatsappNumber ||
      !/^\+[1-9]\d{9,14}$/.test(student.whatsappNumber) ||
      student.communicationOptOut
    ) {
      continue;
    }

    const dueTime = new Date(account.dueDate).getTime();
    const diffHours = (dueTime - now.getTime()) / (1000 * 3600);

    let eventType: string | null = null;
    if (diffHours > 24 && diffHours <= 48) {
      eventType = 'FEE_REMINDER_48H';
    } else if (diffHours > 0 && diffHours <= 24) {
      eventType = 'FEE_REMINDER_24H';
    } else if (diffHours <= 0 && diffHours > -24) {
      eventType = 'FEE_REMINDER_DUE_DATE';
    } else if (diffHours <= -24) {
      eventType = 'FEE_REMINDER_OVERDUE';
    }

    if (!eventType) continue;

    const eventReference = `${account._id}_${account.academicYear}_${account.dueDate.toISOString().slice(0, 10)}`;

    const alreadySent = await AutomationDelivery.findOne({
      institutionId,
      automationId: automation._id,
      studentId: student._id,
      academicYear: account.academicYear,
      eventType,
      eventReference
    });

    if (alreadySent) continue;

    await AutomationDelivery.create({
      institutionId,
      automationId: automation._id,
      studentId: student._id,
      academicYear: account.academicYear,
      eventType,
      eventReference,
      deliveredAt: new Date()
    });

    let paymentToken = '';
    try {
      let existingIntent = await PaymentIntent.findOne({
        institutionId,
        studentId: student._id,
        feeAccountId: account._id,
        status: 'CREATED',
        expiresAt: { $gt: new Date() }
      });
      if (existingIntent) {
        paymentToken = existingIntent.paymentToken;
      } else {
        paymentToken = generateSecureToken(32);
        await PaymentIntent.create({
          institutionId,
          studentId: student._id,
          feeAccountId: account._id,
          amount: account.balance,
          currency: 'INR',
          status: 'CREATED',
          paymentToken,
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000)
        });
      }
    } catch (pErr) {
      logger.warn('PAYMENT_INTENT_CREATION_FAILED', `Failed to create payment intent for student ${student._id}`);
    }

    const clientBaseUrl = (process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? 'https://xync.alphaprime.co.in' : 'http://localhost:5173')).replace(/\/+$/, '');
    const variables: Record<string, string> = {
      student_name: student.name,
      balance: String(account.balance),
      fee_amount: String(account.totalAmount),
      due_date: account.dueDate.toISOString().slice(0, 10),
      fine_amount: String(account.fineAmount || 0),
      payment_link: paymentToken ? `${clientBaseUrl}/pay/${paymentToken}` : `${clientBaseUrl}/pay/${student._id}`
    };

    const template = automation.template || 'Dear {{student_name}}, your tuition fee balance of ₹{{balance}} is due on {{due_date}}. Please pay online: {{payment_link}}';
    const idempotencyKey = `fee_${eventType}_${institutionId}_${student._id}_${eventReference}`;

    await Job.create({
      type: 'MESSAGE',
      payload: {
        institutionId: institutionId.toString(),
        studentId: student._id.toString(),
        automationId: automation._id.toString(),
        recipient: student.whatsappNumber,
        templateName: 'fee_reminder',
        body: template,
        variables,
        idempotencyKey,
        eventType,
        eventReference,
        source: 'AUTOMATION'
      },
      status: 'QUEUED',
      runAt: new Date()
    });

    queuedCount++;
  }

  if (queuedCount > 0) {
    logger.info('FEE_REMINDERS_EVALUATED', `Queued ${queuedCount} fee reminders for outstanding balances`);
  }

  return queuedCount;
}

/**
 * 3. COLLEGE INFORMATION / ANNOUNCEMENTS AUTOMATION
 * Target filters: ALL, DEPARTMENT, COURSE, YEAR, SECTION
 */
export async function evaluateAnnouncements(institutionId: Types.ObjectId): Promise<number> {
  const pendingAnnouncements = await Announcement.find({
    institutionId,
    status: 'SCHEDULED',
    sendAt: { $lte: new Date() }
  });

  let queuedCount = 0;

  for (const ann of pendingAnnouncements) {
    const filter: any = {
      institutionId,
      status: 'ACTIVE',
      validationStatus: { $in: ['VALID', 'WARNING'] },
      whatsappNumber: { $exists: true, $ne: '', $regex: /^\+[1-9]\d{9,14}$/ },
      communicationOptOut: { $ne: true }
    };

    if (ann.target === 'DEPARTMENT' && ann.targetValue) filter.department = ann.targetValue;
    if (ann.target === 'COURSE' && ann.targetValue) filter.course = ann.targetValue;
    if (ann.target === 'YEAR' && ann.targetValue) filter.year = ann.targetValue;
    if (ann.target === 'SECTION' && ann.targetValue) filter.section = ann.targetValue;

    const audience = await Student.find(filter);

    for (const student of audience) {
      const idempotencyKey = `announcement_${ann.announcementId}_${student._id}`;

      const variables: Record<string, string> = {
        student_name: student.name,
        college_name: 'AlphaXync Educational Institution',
        announcement_title: ann.title,
        announcement_message: ann.message
      };

      await Job.create({
        type: 'MESSAGE',
        payload: {
          institutionId: institutionId.toString(),
          studentId: student._id.toString(),
          recipient: student.whatsappNumber,
          templateName: 'college_announcement',
          body: 'Notice from {{college_name}}: {{announcement_title}}\n{{announcement_message}}',
          variables,
          idempotencyKey,
          eventType: 'ANNOUNCEMENT',
          eventReference: ann.announcementId,
          source: 'AUTOMATION'
        },
        status: 'QUEUED',
        runAt: new Date()
      });

      queuedCount++;
    }

    ann.status = 'SENT';
    ann.sentCount = audience.length;
    await ann.save();
  }

  return queuedCount;
}

/**
 * 4. COMPLAINTS / HELP AUTOMATION
 * Auto-acknowledges newly arrived helpdesk tickets
 */
export async function evaluateComplaints(institutionId: Types.ObjectId): Promise<number> {
  const automation = await Automation.findOne({ institutionId, type: 'COMPLAINT', enabled: true });
  if (!automation || automation.isPaused) return 0;

  // Unacknowledged open tickets
  const openTickets = await Ticket.find({
    institutionId,
    status: 'OPEN',
    phone: { $exists: true, $ne: '' }
  }).limit(20);

  let queuedCount = 0;

  for (const ticket of openTickets) {
    const idempotencyKey = `complaint_ack_${institutionId}_${ticket._id}`;

    const alreadyDelivered = await AutomationDelivery.findOne({
      institutionId,
      automationId: automation._id,
      eventReference: ticket._id.toString()
    });

    if (alreadyDelivered) continue;

    await AutomationDelivery.create({
      institutionId,
      automationId: automation._id,
      studentId: ticket.studentId,
      academicYear: '2026-2027',
      eventType: 'COMPLAINT_ACK',
      eventReference: ticket._id.toString(),
      deliveredAt: new Date()
    });

    const variables: Record<string, string> = {
      student_name: ticket.senderName || 'Student',
      ticket_id: ticket._id.toString().slice(-6),
      subject: ticket.subject || 'Inquiry'
    };

    const template = automation.template || 'Hello {{student_name}}, we have received your query regarding "{{subject}}". Ticket #{{ticket_id}} is under review.';

    await Job.create({
      type: 'MESSAGE',
      payload: {
        institutionId: institutionId.toString(),
        studentId: ticket.studentId?.toString(),
        automationId: automation._id.toString(),
        recipient: ticket.phone,
        templateName: 'complaint_ack',
        body: template,
        variables,
        idempotencyKey,
        eventType: 'COMPLAINT_ACK',
        eventReference: ticket._id.toString(),
        source: 'AUTOMATION'
      },
      status: 'QUEUED',
      runAt: new Date()
    });

    queuedCount++;
  }

  return queuedCount;
}

/**
 * 5. STAFF AUTOMATION
 * Staff salary, increment, and administrative notices
 */
export async function evaluateStaffNotices(institutionId: Types.ObjectId): Promise<number> {
  const automation = await Automation.findOne({ institutionId, type: 'STAFF', enabled: true });
  if (!automation || automation.isPaused) return 0;

  const eligibleStaff = await Staff.find({
    institutionId,
    status: 'ACTIVE',
    whatsappNumber: { $exists: true, $ne: '' },
    communicationOptOut: { $ne: true }
  });

  let queuedCount = 0;
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  for (const staff of eligibleStaff) {
    const eventReference = `${staff._id}_${currentMonth}`;
    const idempotencyKey = `staff_notice_${institutionId}_${staff._id}_${currentMonth}`;

    const alreadySent = await AutomationDelivery.findOne({
      institutionId,
      automationId: automation._id,
      eventReference
    });

    if (alreadySent) continue;

    await AutomationDelivery.create({
      institutionId,
      automationId: automation._id,
      staffId: staff._id,
      academicYear: '2026-2027',
      eventType: 'STAFF_NOTICE',
      eventReference,
      deliveredAt: new Date()
    });

    const variables: Record<string, string> = {
      staff_name: staff.name,
      department: staff.department || 'General',
      salary_date: staff.salaryDate || 'End of month',
      increment_date: staff.incrementDate || 'Annual review'
    };

    const template = automation.template || 'Dear {{staff_name}} ({{department}}), your monthly staff information update is ready for review.';

    await Job.create({
      type: 'MESSAGE',
      payload: {
        institutionId: institutionId.toString(),
        staffId: staff._id.toString(),
        automationId: automation._id.toString(),
        recipient: staff.whatsappNumber,
        templateName: 'staff_notice',
        body: template,
        variables,
        idempotencyKey,
        eventType: 'STAFF_NOTICE',
        eventReference,
        source: 'AUTOMATION'
      },
      status: 'QUEUED',
      runAt: new Date()
    });

    queuedCount++;
  }

  if (queuedCount > 0) {
    logger.info('STAFF_NOTICES_EVALUATED', `Queued ${queuedCount} staff notices`);
  }

  return queuedCount;
}

/**
 * Universal Template Variable Resolver
 * Dynamically resolves {{tags}} from standard student data, financial accounts, institution,
 * and ANY custom column from Google Sheets rawSourceData with case/space-insensitive matching.
 */
export function resolveTemplateVariables(
  template: string,
  student?: any,
  feeAccount?: any,
  collegeName?: string,
  paymentLink?: string
): string {
  if (!template) return '';

  const dict = new Map<string, string>();
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, '');

  const setVar = (key: string, val: any) => {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      dict.set(norm(key), String(val).trim());
    }
  };

  // Standard student fields
  if (student) {
    setVar('student_name', student.name);
    setVar('studentname', student.name);
    setVar('name', student.name);
    setVar('student', student.name);
    setVar('register_number', student.externalStudentId);
    setVar('registernumber', student.externalStudentId);
    setVar('register_no', student.externalStudentId);
    setVar('regno', student.externalStudentId);
    setVar('father_name', student.fatherName || 'Parent');
    setVar('fathername', student.fatherName || 'Parent');
    setVar('mother_name', student.motherName || 'Parent');
    setVar('mothername', student.motherName || 'Parent');
    setVar('course', student.course || '');
    setVar('department', student.department || '');
    setVar('dept', student.department || '');
    setVar('year', student.year || '');
    setVar('section', student.section || '');
    setVar('whatsapp_number', student.whatsappNumber || '');
    setVar('whatsapp', student.whatsappNumber || '');
    setVar('mobile', student.whatsappNumber || '');

    // Every column from Google Sheets rawSourceData!
    if (student.rawSourceData) {
      for (const [rawKey, rawVal] of Object.entries(student.rawSourceData)) {
        setVar(rawKey, rawVal);
      }
    }
  }

  // System & Institution details
  setVar('college_name', collegeName || 'AlphaXync Educational Institution');
  setVar('collegename', collegeName || 'AlphaXync Educational Institution');
  setVar('institution_name', collegeName || 'AlphaXync Educational Institution');
  setVar('institutionname', collegeName || 'AlphaXync Educational Institution');
  setVar('academic_year', student?.academicYear || '2026-27');
  setVar('academicyear', student?.academicYear || '2026-27');
  setVar('current_date', new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
  setVar('date', new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));

  // Financial details
  if (feeAccount) {
    const total = Number(feeAccount.totalAmount) || 0;
    const paid = Number(feeAccount.paidAmount) || 0;
    const bal = Number(feeAccount.balance) !== undefined ? Number(feeAccount.balance) : Math.max(0, total - paid);

    setVar('total_fee', `₹${total.toLocaleString('en-IN')}`);
    setVar('totalfee', `₹${total.toLocaleString('en-IN')}`);
    setVar('fee_amount', `₹${total.toLocaleString('en-IN')}`);
    setVar('fee', `₹${total.toLocaleString('en-IN')}`);
    setVar('paid_amount', `₹${paid.toLocaleString('en-IN')}`);
    setVar('paidamount', `₹${paid.toLocaleString('en-IN')}`);
    setVar('paid', `₹${paid.toLocaleString('en-IN')}`);
    setVar('balance', `₹${bal.toLocaleString('en-IN')}`);
    setVar('remaining_balance', `₹${bal.toLocaleString('en-IN')}`);
    setVar('due_date', feeAccount.dueDate ? new Date(feeAccount.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'As Scheduled');
    setVar('duedate', feeAccount.dueDate ? new Date(feeAccount.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'As Scheduled');
    setVar('fine_amount', `₹${Number(feeAccount.fineAmount || 0).toLocaleString('en-IN')}`);
    setVar('fine', `₹${Number(feeAccount.fineAmount || 0).toLocaleString('en-IN')}`);
  }

  if (paymentLink) {
    setVar('payment_link', paymentLink);
    setVar('paymentlink', paymentLink);
    setVar('pay_link', paymentLink);
    setVar('link', paymentLink);
  } else if (student?._id) {
    const clientBaseUrl = (process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? 'https://xync.alphaprime.co.in' : 'http://localhost:5173')).replace(/\/+$/, '');
    setVar('payment_link', `${clientBaseUrl}/pay/${student._id.toString().slice(-6)}`);
  }

  // Replace {{ any_tag }}
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, tag) => {
    const cleanTag = norm(tag);
    if (dict.has(cleanTag)) {
      return dict.get(cleanTag)!;
    }
    return match;
  });
}

/**
 * Evaluates and dispatches a single Custom Automation Campaign.
 */
export async function evaluateCustomAutomation(automation: any): Promise<number> {
  if (!automation.enabled || automation.isPaused) return 0;
  const institutionId = automation.institutionId;

  const inst = await Institution.findById(institutionId);
  const collegeName = inst?.name || 'Campus Administration';

  // 1. Fetch eligible active students with a valid WhatsApp phone number
  const allStudents = await Student.find({
    institutionId,
    status: 'ACTIVE',
    communicationOptOut: { $ne: true },
    whatsappNumber: { $exists: true, $ne: '', $regex: /\d{10,14}/ }
  });

  // 2. Filter by audience criteria if specified
  const criteria = automation.audience?.criteria || [];
  const feeStatus = automation.audience?.feeStatus;

  let matchingStudents = allStudents;

  if (criteria.length > 0) {
    matchingStudents = allStudents.filter((student) => {
      return criteria.every((c: { field: string; operator?: string; value: string }) => {
        if (!c.field || !c.value || !c.value.trim()) return true;
        const targetField = c.field.toLowerCase().trim();
        const targetVal = c.value.toLowerCase().trim();
        const op = (c.operator || 'EQUALS').toUpperCase();

        let foundVal: string | null = null;
        if (targetField === 'course' || targetField.includes('course')) foundVal = student.course || null;
        else if (targetField === 'department' || targetField.includes('dept')) foundVal = student.department || null;
        else if (targetField === 'year' || targetField.includes('year')) foundVal = student.year || null;
        else if (targetField === 'section' || targetField.includes('sec')) foundVal = student.section || null;

        if (foundVal === null && student.rawSourceData) {
          for (const [k, v] of Object.entries(student.rawSourceData)) {
            if (k.toLowerCase().trim() === targetField) {
              foundVal = v !== undefined && v !== null ? String(v) : null;
              break;
            }
          }
        }

        if (foundVal === null && (student as any)[c.field] !== undefined) {
          foundVal = String((student as any)[c.field]);
        }

        const actual = (foundVal || '').toLowerCase().trim();

        if (op === 'CONTAINS') {
          return actual.includes(targetVal);
        } else if (op === 'NOT_EQUALS') {
          return actual !== targetVal;
        } else {
          return actual === targetVal;
        }
      });
    });
  }

  // 3. Filter by feeStatus if specified
  if (feeStatus && feeStatus !== 'ALL') {
    const studentIds = matchingStudents.map((s) => s._id);
    let feeQuery: any = { institutionId, studentId: { $in: studentIds } };

    if (feeStatus === 'HAS_BALANCE') {
      feeQuery.balance = { $gt: 0 };
    } else {
      feeQuery.status = feeStatus;
    }

    const feeAccounts = await FeeAccount.find(feeQuery).select('studentId balance').lean();
    const matchedFeeStudentIds = new Set(feeAccounts.map((fa) => fa.studentId.toString()));
    matchingStudents = matchingStudents.filter((s) => matchedFeeStudentIds.has(s._id.toString()));
  }

  // Skip AFTER_PAYMENT from periodic batch evaluation as it is triggered directly by payment events
  if (automation.schedule?.triggerType === 'AFTER_PAYMENT') {
    return 0;
  }

  // 4. Batch fetch FeeAccounts for variable replacement
  const studentIds = matchingStudents.map((s) => s._id);
  const feeAccounts = await FeeAccount.find({ institutionId, studentId: { $in: studentIds } });
  const feeByStudent = new Map(feeAccounts.map((fa) => [fa.studentId.toString(), fa]));

  let queuedCount = 0;
  for (const student of matchingStudents) {
    const canonicalPhone = normalizePhoneNumber(student.whatsappNumber || '');
    if (!canonicalPhone) {
      logger.warn('CAMPAIGN_SKIPPED_NO_PHONE', `Skipping student ${student.name} (${student.externalStudentId}) due to missing/invalid phone in Google Sheet`);
      continue;
    }

    const feeAccount = feeByStudent.get(student._id.toString());

    // If triggerType is BEFORE_DUE_DATE, evaluate due date offset
    if (automation.schedule?.triggerType === 'BEFORE_DUE_DATE') {
      if (!feeAccount || feeAccount.balance <= 0 || !feeAccount.dueDate) {
        continue; // No outstanding balance or due date to remind
      }
      const targetOffset = automation.schedule?.offsetDays ?? -2;
      const dueMidnight = new Date(feeAccount.dueDate).setHours(0, 0, 0, 0);
      const nowMidnight = new Date().setHours(0, 0, 0, 0);
      const diffDays = Math.round((dueMidnight - nowMidnight) / (1000 * 3600 * 24));
      
      const expectedDiff = targetOffset <= 0 ? Math.abs(targetOffset) : -targetOffset;
      // Allow exact match or if within the due reminder window (e.g. 1 to 2 days)
      if (diffDays !== expectedDiff && !(targetOffset === -2 && diffDays <= 2 && diffDays >= 1)) {
        continue;
      }
    }

    // Deduplication and Multi-Run / Frequency evaluation
    const maxExecutions = automation.schedule?.maxExecutions || 1;
    const repeatIntervalDays = automation.schedule?.repeatIntervalDays || 1;

    const pastDeliveries = await AutomationDelivery.find({
      automationId: automation._id,
      studentId: student._id
    }).sort({ deliveredAt: -1 });

    if (pastDeliveries.length >= maxExecutions) {
      continue; // Maximum sends already completed for this student
    }

    if (pastDeliveries.length > 0) {
      const lastSentTime = new Date(pastDeliveries[0].deliveredAt).getTime();
      const hoursSinceLast = (Date.now() - lastSentTime) / (1000 * 3600);
      if (hoursSinceLast < repeatIntervalDays * 24) {
        continue; // Waiting for repeat interval to elapse
      }
    }

    const currentAttempt = pastDeliveries.length + 1;
    const idempotencyKey = `CAMPAIGN-${automation._id}-${student._id}-RUN-${currentAttempt}-${new Date().toISOString().slice(0, 10)}`;

    let paymentLink = '';
    if (automation.template && (automation.template.includes('payment_link') || automation.template.includes('link'))) {
      if (feeAccount && feeAccount.balance > 0) {
        try {
          let activeIntent = await PaymentIntent.findOne({
            institutionId,
            studentId: student._id,
            feeAccountId: feeAccount._id,
            status: 'CREATED',
            expiresAt: { $gt: new Date() }
          });
          if (!activeIntent) {
            activeIntent = await PaymentIntent.create({
              institutionId,
              studentId: student._id,
              feeAccountId: feeAccount._id,
              amount: feeAccount.balance,
              currency: 'INR',
              status: 'CREATED',
              paymentToken: generateSecureToken(32),
              expiresAt: new Date(Date.now() + 72 * 3600 * 1000)
            });
          }
          const clientBaseUrl = (process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? 'https://xync.alphaprime.co.in' : 'http://localhost:5173')).replace(/\/+$/, '');
          paymentLink = `${clientBaseUrl}/pay/${activeIntent.paymentToken}`;
        } catch (err) {
          logger.warn('PAYMENT_INTENT_CAMPAIGN_FAILED', `Failed to create payment intent for student ${student._id}`);
        }
      }
    }
    const renderedBody = resolveTemplateVariables(automation.template, student, feeAccount, collegeName, paymentLink);

    await AutomationDelivery.create({
      institutionId,
      automationId: automation._id,
      studentId: student._id,
      academicYear: student.academicYear || '2026-27',
      eventType: 'CUSTOM_CAMPAIGN',
      eventReference: `${automation.name || 'Custom Campaign'} (Run #${currentAttempt})`,
      deliveredAt: new Date()
    });

    await Job.create({
      type: 'MESSAGE',
      payload: {
        institutionId: institutionId.toString(),
        studentId: student._id.toString(),
        automationId: automation._id.toString(),
        recipient: canonicalPhone,
        templateName: 'custom_campaign',
        body: renderedBody,
        mediaUrl: automation.mediaUrl || undefined,
        idempotencyKey,
        eventType: 'CUSTOM_CAMPAIGN',
        source: 'AUTOMATION'
      },
      status: 'QUEUED',
      runAt: new Date()
    });

    queuedCount++;
  }

  if (queuedCount > 0) {
    if (!automation.metrics) {
      automation.metrics = { totalSent: 0, totalDelivered: 0, totalFailed: 0 };
    }
    automation.metrics.totalSent = (automation.metrics.totalSent || 0) + queuedCount;
    automation.metrics.lastTriggeredAt = new Date();
    await automation.save();
    logger.info('CUSTOM_AUTOMATION_EVALUATED', `Queued ${queuedCount} messages for campaign "${automation.name}"`);
  }

  return queuedCount;
}

/**
 * Dispatches all active AFTER_PAYMENT custom automations immediately upon payment success.
 */
export async function evaluateAfterPaymentAutomations(params: {
  institutionId: Types.ObjectId;
  studentId: Types.ObjectId;
  feeAccountId: Types.ObjectId;
  paymentId?: Types.ObjectId;
  amount: number;
  receiptNumber?: string;
}): Promise<number> {
  const { institutionId, studentId, feeAccountId, receiptNumber } = params;
  const automations = await Automation.find({
    institutionId,
    type: 'CUSTOM',
    enabled: true,
    isPaused: { $ne: true },
    'schedule.triggerType': 'AFTER_PAYMENT'
  });

  if (!automations || automations.length === 0) return 0;

  const student = await Student.findOne({ _id: studentId, institutionId });
  if (!student || student.communicationOptOut || !student.whatsappNumber) return 0;
  const canonicalPhone = normalizePhoneNumber(student.whatsappNumber);
  if (!canonicalPhone) return 0;

  const feeAccount = await FeeAccount.findById(feeAccountId);
  const inst = await Institution.findById(institutionId);
  const collegeName = inst?.name || 'Campus Administration';

  let queued = 0;
  for (const auto of automations) {
    const idempotencyKey = `PAY_SUCCESS-${auto._id}-${student._id}-${receiptNumber || Date.now()}`;
    const renderedBody = resolveTemplateVariables(auto.template, student, feeAccount, collegeName, '');

    await AutomationDelivery.create({
      institutionId,
      automationId: auto._id,
      studentId: student._id,
      academicYear: student.academicYear || '2026-27',
      eventType: 'AFTER_PAYMENT',
      eventReference: receiptNumber || 'Payment Receipt',
      deliveredAt: new Date()
    });

    await Job.create({
      type: 'MESSAGE',
      payload: {
        institutionId: institutionId.toString(),
        studentId: student._id.toString(),
        automationId: auto._id.toString(),
        recipient: canonicalPhone,
        templateName: 'custom_campaign',
        body: renderedBody,
        mediaUrl: auto.mediaUrl || undefined,
        idempotencyKey,
        eventType: 'AFTER_PAYMENT',
        source: 'AUTOMATION'
      },
      status: 'QUEUED',
      runAt: new Date()
    });
    queued++;
  }
  return queued;
}

/**
 * Evaluates all active CUSTOM automation campaigns for an institution.
 */
export async function evaluateAllCustomAutomations(institutionId: Types.ObjectId): Promise<number> {
  const customAutomations = await Automation.find({
    institutionId,
    type: 'CUSTOM',
    enabled: true,
    isPaused: { $ne: true }
  });

  let totalCustom = 0;
  for (const campaign of customAutomations) {
    try {
      const count = await evaluateCustomAutomation(campaign);
      totalCustom += count;
    } catch (err: any) {
      logger.error('CUSTOM_AUTOMATION_ERROR', `Error evaluating campaign ${campaign.name}: ${err.message}`);
    }
  }
  return totalCustom;
}

/**
 * Universal evaluation runner for all automation modules (built-in + custom campaigns).
 */
export async function evaluateAllAutomations(institutionId: Types.ObjectId): Promise<{
  totalQueued: number;
  greetings: number;
  custom: number;
}> {
  const [greetings, custom] = await Promise.all([
    evaluateGreetings(institutionId),
    evaluateAllCustomAutomations(institutionId)
  ]);

  const totalQueued = greetings + custom;
  if (totalQueued > 0) {
    logger.info('ALL_AUTOMATIONS_EVALUATED', `Queued ${totalQueued} total outbound automation jobs`);
  }

  return {
    totalQueued,
    greetings,
    custom
  };
}


