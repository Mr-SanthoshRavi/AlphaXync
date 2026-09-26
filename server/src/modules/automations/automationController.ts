import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Automation, AutomationType } from '../../models/Automation';
import { Student } from '../../models/Student';
import { Staff } from '../../models/Staff';
import { Message } from '../../models/Message';
import { FeeAccount } from '../../models/FeeAccount';
import { Institution } from '../../models/Institution';
import { DataConnection } from '../../models/DataConnection';
import { AuditLog } from '../../models/AuditLog';
import { AppError } from '../../middleware/errorHandler';
import { resetCircuitBreaker } from '../../workers/messageWorker';
import { resolveTemplateVariables, evaluateCustomAutomation } from '../../workers/automationWorker';
import { broadcastEvent } from '../events/eventStream';
import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

const updateAutomationSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  template: z.string().optional(),
  mediaUrl: z.string().optional().nullable(),
  sourceProvider: z.enum(['google_sheets', 'native_sheet', 'all']).optional(),
  audience: z.any().optional(),
  conditions: z.any().optional(),
  schedule: z.any().optional(),
  settings: z.any().optional(),
  minSendIntervalMs: z.number().optional()
});

const createCustomAutomationSchema = z.object({
  name: z.string().min(2, 'Campaign name must be at least 2 characters'),
  description: z.string().optional(),
  template: z.string().min(3, 'Template message must be at least 3 characters'),
  mediaUrl: z.string().optional().nullable(),
  sourceProvider: z.enum(['google_sheets', 'native_sheet', 'all']).default('all'),
  audience: z.object({
    target: z.string().default('ALL'),
    departments: z.array(z.string()).optional(),
    courses: z.array(z.string()).optional(),
    years: z.array(z.string()).optional(),
    sections: z.array(z.string()).optional(),
    criteria: z.array(z.object({
      field: z.string(),
      operator: z.string().default('EQUALS'),
      value: z.string()
    })).optional(),
    feeStatus: z.string().optional()
  }).optional(),
  schedule: z.object({
    triggerType: z.enum(['MANUAL', 'ON_SYNC', 'BEFORE_DUE_DATE', 'AFTER_PAYMENT', 'SCHEDULED', 'RECURRING']).default('MANUAL'),
    scheduledDate: z.string().optional(),
    offsetDays: z.number().optional(),
    timeOfDay: z.string().optional(),
    repeatIntervalDays: z.number().optional(),
    interval: z.string().optional(),
    maxExecutions: z.number().optional()
  }).optional(),
  enabled: z.boolean().default(true)
});

const DEFAULT_TEMPLATES: Record<AutomationType, string> = {
  GREETING: 'Hello {{student_name}} 👋\nWelcome to {{college_name}}.\nDear Parent: {{father_name}}\nWe will use this WhatsApp number for important college updates.',
  FEE: 'Dear {{student_name}}, your tuition fee balance of ₹{{balance}} is due on {{due_date}}. Please pay online: {{payment_link}}',
  ANNOUNCEMENT: 'Notice from {{college_name}}: {{announcement_title}}\n{{announcement_message}}',
  COMPLAINT: 'Hello {{student_name}}, we have received your query regarding "{{subject}}". Ticket #{{ticket_id}} is under review.',
  STAFF: 'Dear {{staff_name}}, your monthly salary update has been processed.',
  CUSTOM: 'Hello {{student_name}} 👋\nWelcome to {{college_name}}.\nDear Parent: {{father_name}}\nWe will use this WhatsApp number for important college updates.'
};

export async function getAutomations(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const systemTypes: AutomationType[] = ['GREETING'];

    // Ensure only GREETING exists as the default system singleton module
    // and clean up legacy hardcoded modules (FEE, ANNOUNCEMENT, COMPLAINT, STAFF) to keep it simple and avoid overkill
    await Automation.deleteMany({
      institutionId,
      type: { $in: ['FEE', 'ANNOUNCEMENT', 'COMPLAINT', 'STAFF'] }
    });

    for (const type of systemTypes) {
      const exists = await Automation.findOne({ institutionId, type });
      if (!exists) {
        await Automation.create({
          institutionId,
          type,
          isSystem: true,
          enabled: false,
          template: DEFAULT_TEMPLATES[type]
        });
      }
    }

    const automations = await Automation.find({ institutionId }).sort({ createdAt: 1 }).lean();

    const [allActiveStudents, pendingFeeStudentsCount, activeStaffCount] = await Promise.all([
      Student.find({
        institutionId,
        status: 'ACTIVE',
        validationStatus: { $in: ['VALID', 'WARNING'] },
        communicationOptOut: { $ne: true },
        whatsappNumber: { $exists: true, $ne: '', $regex: /\d{10,14}/ }
      }).lean(),
      Student.countDocuments({
        institutionId,
        status: 'ACTIVE'
      }),
      Staff.countDocuments({
        institutionId,
        status: 'ACTIVE',
        communicationOptOut: { $ne: true }
      })
    ]);

    const enriched = automations.map((a) => {
      let eligibleCount = allActiveStudents.length;

      if (a.type === 'FEE') {
        eligibleCount = pendingFeeStudentsCount;
      } else if (a.type === 'STAFF') {
        eligibleCount = activeStaffCount;
      } else if (a.type === 'CUSTOM') {
        const criteria = a.audience?.criteria || [];
        if (criteria.length > 0) {
          eligibleCount = allActiveStudents.filter((student: any) => {
            return criteria.every((c: { field: string; value: string }) => {
              const targetField = (c.field || '').toLowerCase().trim();
              const targetVal = (c.value || '').toLowerCase().trim();

              let directVal = '';
              if (targetField === 'course' || targetField.includes('course')) directVal = (student.course || '').toLowerCase().trim();
              else if (targetField === 'department' || targetField.includes('dept')) directVal = (student.department || '').toLowerCase().trim();
              else if (targetField === 'year' || targetField.includes('year')) directVal = (student.year || '').toLowerCase().trim();
              else if (targetField === 'section' || targetField.includes('sec')) directVal = (student.section || '').toLowerCase().trim();

              if (directVal && directVal === targetVal) return true;

              if (student.rawSourceData) {
                for (const [k, v] of Object.entries(student.rawSourceData)) {
                  if (k.toLowerCase().trim() === targetField && String(v).toLowerCase().trim() === targetVal) {
                    return true;
                  }
                }
              }
              return false;
            });
          }).length;
        }
      }

      return {
        id: a._id,
        type: a.type,
        name: a.name || undefined,
        description: a.description || undefined,
        enabled: a.enabled,
        template: a.template,
        schedule: a.schedule || {},
        audience: a.audience || { target: 'ALL' },
        conditions: a.conditions || {},
        minSendIntervalMs: a.minSendIntervalMs || 10000,
        isPaused: a.isPaused || false,
        pauseReason: a.pauseReason || null,
        circuitBreakerFailures: a.circuitBreakerFailures || 0,
        metrics: a.metrics || { totalSent: 0, totalDelivered: 0, totalFailed: 0 },
        eligibleCount,
        lastActivity: a.metrics?.lastTriggeredAt
          ? new Date(a.metrics.lastTriggeredAt).toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : 'Ready'
      };
    });

    return res.status(200).json({
      success: true,
      data: enriched
    });
  } catch (error) {
    next(error);
  }
}

export async function pauseAllAutomations(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    await Automation.updateMany(
      { institutionId },
      { isPaused: true, pauseReason: 'ADMIN_MANUAL_PAUSE' }
    );

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'AUTOMATION_PAUSED',
      entityType: 'AUTOMATION',
      reason: 'Admin manually paused all outbound automation queues'
    });

    return res.status(200).json({
      success: true,
      data: { isPaused: true, pauseReason: 'ADMIN_MANUAL_PAUSE' }
    });
  } catch (error) {
    next(error);
  }
}

export async function resumeAllAutomations(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    resetCircuitBreaker();
    await Automation.updateMany(
      { institutionId },
      { isPaused: false, pauseReason: null, circuitBreakerFailures: 0 }
    );

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'AUTOMATION_RESUMED',
      entityType: 'AUTOMATION',
      reason: 'Admin resumed outbound automation queues and reset circuit breaker'
    });

    return res.status(200).json({
      success: true,
      data: { isPaused: false }
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePacingConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { minSendIntervalMs } = req.body;
    const interval = Math.max(1000, Number(minSendIntervalMs) || 10000);

    await Automation.updateMany({ institutionId }, { minSendIntervalMs: interval });

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'PACING_CONFIG_UPDATED',
      entityType: 'AUTOMATION',
      reason: `Updated message interval to ${interval}ms`
    });

    return res.status(200).json({
      success: true,
      data: { minSendIntervalMs: interval }
    });
  } catch (error) {
    next(error);
  }
}

export async function getAutomationSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);

    const [queued, sending, sent, skipped, failed, cancelled] = await Promise.all([
      Message.countDocuments({ institutionId, status: { $in: ['QUEUED', 'WAITING'] } }),
      Message.countDocuments({ institutionId, status: 'SENDING' }),
      Message.countDocuments({ institutionId, status: { $in: ['SENT', 'DELIVERED', 'READ'] } }),
      Message.countDocuments({ institutionId, status: 'SKIPPED' }),
      Message.countDocuments({ institutionId, status: 'FAILED' }),
      Message.countDocuments({ institutionId, status: 'CANCELLED' })
    ]);

    const eligible = queued + sending + sent + skipped + failed + cancelled;

    return res.status(200).json({
      success: true,
      data: {
        eligible,
        queued,
        sending,
        sent,
        skipped,
        failed,
        cancelled
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function toggleAutomation(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { type } = req.params;
    const { enabled } = req.body;

    const isObjectId = Types.ObjectId.isValid(type);
    const automation = isObjectId
      ? await Automation.findOne({ institutionId, _id: type })
      : await Automation.findOne({
          institutionId,
          type: type.toUpperCase() as AutomationType
        });

    if (!automation) {
      throw new AppError('AUTOMATION_NOT_FOUND', 'Automation module not found', 404);
    }

    const before = automation.enabled;
    automation.enabled = Boolean(enabled);
    await automation.save();

    let queuedCount = 0;
    if (automation.enabled) {
      try {
        if (automation.type === 'CUSTOM') {
          queuedCount = await evaluateCustomAutomation(automation);
        } else {
          const {
            evaluateGreetings,
            evaluateFeeReminders,
            evaluateAnnouncements,
            evaluateComplaints,
            evaluateStaffNotices
          } = await import('../../workers/automationWorker');

          if (automation.type === 'GREETING') {
            queuedCount = await evaluateGreetings(institutionId);
          } else if (automation.type === 'FEE') {
            queuedCount = await evaluateFeeReminders(institutionId);
          } else if (automation.type === 'ANNOUNCEMENT') {
            queuedCount = await evaluateAnnouncements(institutionId);
          } else if (automation.type === 'COMPLAINT') {
            queuedCount = await evaluateComplaints(institutionId);
          } else if (automation.type === 'STAFF') {
            queuedCount = await evaluateStaffNotices(institutionId);
          }
        }
      } catch (evalErr: any) {
        // Non-blocking evaluation error
      }
    }

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: automation.enabled ? 'AUTOMATION_ENABLED' : 'AUTOMATION_DISABLED',
      entityType: 'AUTOMATION',
      entityId: automation._id.toString(),
      before: { enabled: before },
      after: { enabled: automation.enabled },
      reason: `Automation ${automation.type} switched to ${automation.enabled}${queuedCount > 0 ? ` (Queued ${queuedCount} messages)` : ''}`
    });

    return res.status(200).json({
      success: true,
      data: {
        type: automation.type,
        enabled: automation.enabled,
        queuedCount
      },
      message: automation.enabled
        ? `Automation activated.${queuedCount > 0 ? ` Queued ${queuedCount} messages for dispatch.` : ''}`
        : 'Automation deactivated.'
    });
  } catch (error) {
    next(error);
  }
}

export async function triggerAutomations(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { evaluateAllAutomations } = await import('../../workers/automationWorker');
    const result = await evaluateAllAutomations(institutionId);

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'AUTOMATION_MANUALLY_TRIGGERED',
      entityType: 'AUTOMATION',
      reason: `Manually triggered universal automation run: ${result.totalQueued} jobs queued`
    });

    return res.status(200).json({
      success: true,
      data: result,
      message: `Universal automation engine evaluated. Queued ${result.totalQueued} messages.`
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAutomation(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { type } = req.params;
    const updates = updateAutomationSchema.parse(req.body);

    const automation = await Automation.findOne({
      institutionId,
      type: type.toUpperCase() as AutomationType
    });

    if (!automation) {
      throw new AppError('AUTOMATION_NOT_FOUND', 'Automation module not found', 404);
    }

    if (updates.template !== undefined) automation.template = updates.template;
    if (updates.audience !== undefined) automation.audience = updates.audience;
    if (updates.conditions !== undefined) automation.conditions = updates.conditions;
    if (updates.schedule !== undefined) automation.schedule = updates.schedule;
    if (updates.settings !== undefined) automation.settings = updates.settings;

    await automation.save();

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'AUTOMATION_UPDATED',
      entityType: 'AUTOMATION',
      entityId: automation._id.toString(),
      reason: `Updated configuration for ${automation.type}`
    });

    return res.status(200).json({
      success: true,
      data: automation
    });
  } catch (error) {
    next(error);
  }
}

export async function getAutomationVariables(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const sourceProvider = req.query.sourceProvider ? String(req.query.sourceProvider) : undefined;

    // Strict isolation: filter students by sheet mode to prevent variable cross-contamination
    const studentFilter: any = { institutionId, status: 'ACTIVE' };
    const isGoogle = sourceProvider === 'google_sheets';
    const isNative = sourceProvider === 'native_sheet' || sourceProvider === 'native';

    if (isGoogle) {
      studentFilter.sourceProvider = 'google_sheets';
    } else if (isNative) {
      studentFilter.sourceProvider = { $in: ['native_sheet', 'excel_import', 'manual'] };
    }

    // 1. Fetch institution for college name
    const inst = await Institution.findById(institutionId);
    const collegeName = inst?.name || 'Campus Administration';

    // 2. Fetch sample student and sample fee account strictly from the selected sheet mode
    let sampleStudent = await Student.findOne(studentFilter).lean();
    if (!sampleStudent && (isGoogle || isNative)) {
      // Graceful fallback to any student if active mode has no records yet
      sampleStudent = await Student.findOne({ institutionId }).lean();
    }
    const sampleFee = sampleStudent ? await FeeAccount.findOne({ institutionId, studentId: sampleStudent._id }).lean() : null;

    // 3. Discover all unique raw column names across students in the selected sheet mode
    const students = await Student.find(studentFilter).limit(80).select('rawSourceData').lean();
    const discoveredSheetCols = new Set<string>();

    for (const s of students) {
      if (s.rawSourceData && typeof s.rawSourceData === 'object') {
        for (const k of Object.keys(s.rawSourceData)) {
          if (k && k.trim() && !k.startsWith('_')) {
            discoveredSheetCols.add(k.trim());
          }
        }
      }
    }

    const sheetCategory = isNative ? 'NATIVE_SHEET' : isGoogle ? 'GOOGLE_SHEET' : 'CUSTOM_SHEET';

    // 4. Build rich structured variables palette with reasonable, clean variable tags
    const variables: Array<{
      tag: string;
      label: string;
      sample: string;
      category: 'STUDENT' | 'FINANCIAL' | 'CUSTOM_SHEET' | 'NATIVE_SHEET' | 'GOOGLE_SHEET' | 'SYSTEM';
    }> = [
      // Standard Student details
      {
        tag: '{{student_name}}',
        label: 'Student Name',
        sample: sampleStudent?.name || 'Arun Kumar',
        category: 'STUDENT'
      },
      {
        tag: '{{register_number}}',
        label: 'Register / Roll No',
        sample: sampleStudent?.externalStudentId || 'ST2026-1001',
        category: 'STUDENT'
      },
      {
        tag: '{{father_name}}',
        label: "Father / Parent Name",
        sample: sampleStudent?.fatherName || 'Ravi Kumar',
        category: 'STUDENT'
      },
      {
        tag: '{{mother_name}}',
        label: "Mother Name",
        sample: (sampleStudent as any)?.motherName || sampleStudent?.rawSourceData?.['Mother Name'] || 'Meena Ravi',
        category: 'STUDENT'
      },
      {
        tag: '{{course}}',
        label: 'Course / Degree',
        sample: sampleStudent?.course || 'BSC Computer Science',
        category: 'STUDENT'
      },
      {
        tag: '{{department}}',
        label: 'Department',
        sample: sampleStudent?.department || 'Computer Science',
        category: 'STUDENT'
      },
      {
        tag: '{{year}}',
        label: 'Academic Year',
        sample: sampleStudent?.year ? `${sampleStudent.year} Year` : 'II Year',
        category: 'STUDENT'
      },
      {
        tag: '{{section}}',
        label: 'Class Section',
        sample: sampleStudent?.section || 'A',
        category: 'STUDENT'
      },
      {
        tag: '{{whatsapp_number}}',
        label: 'WhatsApp Mobile Number',
        sample: sampleStudent?.whatsappNumber || '9876543210',
        category: 'STUDENT'
      },

      // Financial Details
      {
        tag: '{{total_fee}}',
        label: 'Prescribed Total Fee',
        sample: sampleFee ? `₹${Number(sampleFee.totalAmount).toLocaleString('en-IN')}` : '₹50,000',
        category: 'FINANCIAL'
      },
      {
        tag: '{{paid_amount}}',
        label: 'Ledger Paid Amount',
        sample: sampleFee ? `₹${Number(sampleFee.paidAmount).toLocaleString('en-IN')}` : '₹25,000',
        category: 'FINANCIAL'
      },
      {
        tag: '{{balance}}',
        label: 'Remaining Balance Due',
        sample: sampleFee ? `₹${Number(sampleFee.balance).toLocaleString('en-IN')}` : '₹25,000',
        category: 'FINANCIAL'
      },
      {
        tag: '{{due_date}}',
        label: 'Fee Due Date',
        sample: sampleFee?.dueDate ? new Date(sampleFee.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '31 Oct 2026',
        category: 'FINANCIAL'
      },
      {
        tag: '{{fine_amount}}',
        label: 'Late Fine Amount',
        sample: sampleFee ? `₹${Number(sampleFee.fineAmount || 0).toLocaleString('en-IN')}` : '₹500',
        category: 'FINANCIAL'
      },
      {
        tag: '{{payment_link}}',
        label: 'Protected Online Payment Link',
        sample: `https://xync.alphaprime.co.in/pay/${sampleStudent?._id?.toString().slice(-6) || 'a1b2c3'}`,
        category: 'FINANCIAL'
      },

      // System / Institution
      {
        tag: '{{college_name}}',
        label: 'Institution / College Name',
        sample: collegeName,
        category: 'SYSTEM'
      }
    ];

    // Standard normalized tags already added
    const standardNormTags = new Set(variables.map(v => v.tag.replace(/[{}]/g, '').toLowerCase().replace(/[\s_\-]+/g, '')));

    // Add unique discovered columns from the active sheet mode with clean reasonable tags
    for (const sheetCol of discoveredSheetCols) {
      const normCol = sheetCol.toLowerCase().replace(/[\s_\-]+/g, '');
      if (!standardNormTags.has(normCol)) {
        const sampleVal = sampleStudent?.rawSourceData?.[sheetCol] || 'Sample Data';
        const cleanTag = sheetCol.replace(/[{}]/g, '').trim();
        variables.push({
          tag: `{{${cleanTag}}}`,
          label: sheetCol,
          sample: String(sampleVal),
          category: sheetCategory as any
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        variables,
        totalDiscovered: variables.length,
        mode: isNative ? 'native_sheet' : isGoogle ? 'google_sheets' : 'all',
        sheetColumns: Array.from(discoveredSheetCols),
        googleSheetColumns: Array.from(discoveredSheetCols) // for backwards compatibility
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getFilterOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const sourceProvider = req.query.sourceProvider ? String(req.query.sourceProvider) : undefined;

    const studentFilter: any = { institutionId, status: 'ACTIVE' };
    if (sourceProvider === 'google_sheets') {
      studentFilter.sourceProvider = 'google_sheets';
    } else if (sourceProvider === 'native_sheet' || sourceProvider === 'native') {
      studentFilter.sourceProvider = { $in: ['native_sheet', 'excel_import', 'manual'] };
    }

    // Fetch active students strictly from the selected sheet mode
    const students = await Student.find(studentFilter)
      .select('course department year section quota rawSourceData name externalStudentId')
      .lean();

    // Map: Column Name -> Set of distinct values
    const columnValuesMap = new Map<string, Set<string>>();

    const addVal = (col: string, val: any) => {
      if (val === undefined || val === null) return;
      const str = String(val).trim();
      if (!str || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'null') return;
      if (!columnValuesMap.has(col)) {
        columnValuesMap.set(col, new Set<string>());
      }
      const set = columnValuesMap.get(col)!;
      if (set.size < 50) {
        set.add(str);
      }
    };

    for (const s of students) {
      if (s.course) addVal('Course', s.course);
      if (s.department) addVal('Department', s.department);
      if (s.year) addVal('Year', s.year);
      if (s.section) addVal('Section', s.section);
      if ((s as any).quota) addVal('Quota', (s as any).quota);

      if (s.rawSourceData && typeof s.rawSourceData === 'object') {
        for (const [key, val] of Object.entries(s.rawSourceData)) {
          if (key && key.trim()) {
            addVal(key.trim(), val);
          }
        }
      }
    }

    // Convert to sorted columns array
    const columns = Array.from(columnValuesMap.entries())
      .filter(([_, valuesSet]) => valuesSet.size > 0)
      .map(([col, valuesSet]) => ({
        key: col,
        label: col,
        values: Array.from(valuesSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      }))
      .sort((a, b) => {
        // Priority order for standard core columns
        const priorityCols = ['course', 'department', 'year', 'section', 'batch', 'class', 'standard'];
        const aIndex = priorityCols.indexOf(a.key.toLowerCase());
        const bIndex = priorityCols.indexOf(b.key.toLowerCase());
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.label.localeCompare(b.label);
      });

    return res.status(200).json({
      success: true,
      data: {
        columns,
        totalActiveContacts: students.length,
        mode: sourceProvider || 'all'
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getMatchingRecipientCount(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { target = 'ALL', criteria = [], feeStatus = 'ALL', sourceProvider } = req.body;

    const studentFilter: any = {
      institutionId,
      status: 'ACTIVE',
      communicationOptOut: { $ne: true },
      whatsappNumber: { $exists: true, $ne: '', $regex: /\d{10,14}/ }
    };

    if (sourceProvider === 'google_sheets') {
      studentFilter.sourceProvider = 'google_sheets';
    } else if (sourceProvider === 'native_sheet' || sourceProvider === 'native') {
      studentFilter.sourceProvider = { $in: ['native_sheet', 'excel_import', 'manual'] };
    }

    const allStudents = await Student.find(studentFilter).lean();

    let matching = allStudents;

    if (target === 'CRITERIA' && Array.isArray(criteria) && criteria.length > 0) {
      matching = allStudents.filter((student) => {
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

    if (feeStatus && feeStatus !== 'ALL') {
      const studentIds = matching.map((s) => s._id);
      let feeQuery: any = { institutionId, studentId: { $in: studentIds } };

      if (feeStatus === 'HAS_BALANCE') {
        feeQuery.balance = { $gt: 0 };
      } else {
        feeQuery.status = feeStatus;
      }

      const matchingFeeAccounts = await FeeAccount.find(feeQuery).select('studentId balance').lean();
      const matchedStudentIdSet = new Set(matchingFeeAccounts.map((fa) => fa.studentId.toString()));
      matching = matching.filter((s) => matchedStudentIdSet.has(s._id.toString()));
    }

    const sampleRecipients = matching.slice(0, 5).map((s) => {
      const extra = s.course || s.department || (s.rawSourceData && Object.values(s.rawSourceData)[0]) || s.externalStudentId;
      return extra ? `${s.name} (${extra})` : s.name;
    });

    return res.status(200).json({
      success: true,
      data: {
        matchingCount: matching.length,
        totalEligible: allStudents.length,
        sampleRecipients
      }
    });
  } catch (error) {
    next(error);
  }
}


export async function createCustomAutomation(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const data = createCustomAutomationSchema.parse(req.body);

    const automation = await Automation.create({
      institutionId,
      type: 'CUSTOM',
      name: data.name,
      description: data.description || '',
      template: data.template,
      mediaUrl: data.mediaUrl || null,
      sourceProvider: data.sourceProvider || 'all',
      audience: data.audience || { target: 'ALL' },
      schedule: data.schedule || { triggerType: 'MANUAL' },
      enabled: data.enabled ?? true,
      metrics: {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0
      }
    });

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'AUTOMATION_CREATED',
      entityType: 'AUTOMATION',
      entityId: automation._id.toString(),
      reason: `Created custom automation campaign: "${data.name}"`
    });

    try {
      broadcastEvent(institutionId.toString(), 'DATA_UPDATED', {
        type: 'DATA_UPDATED',
        source: 'automation_created',
        automationId: automation._id
      });
    } catch (e) {}

    return res.status(201).json({
      success: true,
      data: automation,
      message: `Custom campaign "${automation.name}" created successfully.`
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCustomAutomation(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { id } = req.params;
    const updates = updateAutomationSchema.parse(req.body);

    const automation = await Automation.findOne({ _id: id, institutionId });
    if (!automation) {
      throw new AppError('AUTOMATION_NOT_FOUND', 'Automation campaign not found', 404);
    }

    if (updates.name !== undefined) automation.name = updates.name;
    if (updates.description !== undefined) automation.description = updates.description;
    if (updates.template !== undefined) automation.template = updates.template;
    if (updates.mediaUrl !== undefined) automation.mediaUrl = updates.mediaUrl || undefined;
    if (updates.sourceProvider !== undefined) automation.sourceProvider = updates.sourceProvider;
    if (updates.audience !== undefined) automation.audience = updates.audience;
    if (updates.schedule !== undefined) automation.schedule = updates.schedule;
    if (updates.conditions !== undefined) automation.conditions = updates.conditions;
    if (updates.settings !== undefined) automation.settings = updates.settings;

    await automation.save();

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'AUTOMATION_UPDATED',
      entityType: 'AUTOMATION',
      entityId: automation._id.toString(),
      reason: `Updated custom automation: "${automation.name}"`
    });

    try {
      broadcastEvent(institutionId.toString(), 'DATA_UPDATED', {
        type: 'DATA_UPDATED',
        source: 'automation_updated',
        automationId: automation._id
      });
    } catch (e) {}

    return res.status(200).json({
      success: true,
      data: automation,
      message: `Campaign "${automation.name}" updated successfully.`
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCustomAutomation(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { id } = req.params;

    const automation = await Automation.findOneAndDelete({
      _id: id,
      institutionId,
      type: 'CUSTOM'
    });

    if (!automation) {
      throw new AppError('AUTOMATION_NOT_FOUND', 'Custom campaign not found or cannot delete built-in module', 404);
    }

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'AUTOMATION_DELETED',
      entityType: 'AUTOMATION',
      entityId: id,
      reason: `Deleted custom automation campaign "${automation.name}"`
    });

    try {
      broadcastEvent(institutionId.toString(), 'DATA_UPDATED', {
        type: 'DATA_UPDATED',
        source: 'automation_deleted',
        automationId: id
      });
    } catch (e) {}

    return res.status(200).json({
      success: true,
      data: { message: `Campaign "${automation.name}" deleted successfully.` }
    });
  } catch (error) {
    next(error);
  }
}

export async function triggerSingleAutomation(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { id } = req.params;

    const automation = await Automation.findOne({ _id: id, institutionId });
    if (!automation) {
      throw new AppError('AUTOMATION_NOT_FOUND', 'Automation not found', 404);
    }

    let queuedCount = 0;
    if (automation.type === 'CUSTOM') {
      queuedCount = await evaluateCustomAutomation(automation);
    } else {
      const {
        evaluateGreetings,
        evaluateFeeReminders,
        evaluateAnnouncements,
        evaluateComplaints,
        evaluateStaffNotices
      } = await import('../../workers/automationWorker');

      if (automation.type === 'GREETING') queuedCount = await evaluateGreetings(institutionId);
      else if (automation.type === 'FEE') queuedCount = await evaluateFeeReminders(institutionId);
      else if (automation.type === 'ANNOUNCEMENT') queuedCount = await evaluateAnnouncements(institutionId);
      else if (automation.type === 'COMPLAINT') queuedCount = await evaluateComplaints(institutionId);
      else if (automation.type === 'STAFF') queuedCount = await evaluateStaffNotices(institutionId);
    }

    await AuditLog.create({
      institutionId,
      actorUserId: req.user!.userId,
      actorRole: req.user!.role,
      action: 'AUTOMATION_MANUALLY_TRIGGERED',
      entityType: 'AUTOMATION',
      entityId: automation._id.toString(),
      reason: `Manually triggered campaign "${automation.name || automation.type}": ${queuedCount} jobs queued`
    });

    return res.status(200).json({
      success: true,
      data: {
        automationId: automation._id,
        queuedCount
      },
      message: `Dispatched campaign "${automation.name || automation.type}". Queued ${queuedCount} messages for delivery.`
    });
  } catch (error) {
    next(error);
  }
}

export async function previewDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { template, studentId } = req.body;

    const inst = await Institution.findById(institutionId);
    const collegeName = inst?.name || 'Campus Administration';

    let targetStudent: any = null;
    let targetFeeAccount: any = null;

    if (studentId) {
      targetStudent = await Student.findOne({ _id: studentId, institutionId }).lean();
    } else {
      // Pick the first active student to show real Google Sheet preview data
      targetStudent = await Student.findOne({ institutionId, status: 'ACTIVE' }).lean();
    }

    if (targetStudent) {
      targetFeeAccount = await FeeAccount.findOne({ institutionId, studentId: targetStudent._id }).lean();
    }

    const rendered = resolveTemplateVariables(template || '', targetStudent, targetFeeAccount, collegeName);

    return res.status(200).json({
      success: true,
      data: {
        rendered,
        studentName: targetStudent?.name || 'Sample Student',
        registerNo: targetStudent?.externalStudentId || 'ST-000'
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function aiPolishTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { draft = '' } = req.body;

    if (!draft || !draft.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please provide message template draft text to check'
      });
    }

    // 1. Discover all valid variable tags for this institution
    const sampleStudents = await Student.find({ institutionId, status: 'ACTIVE' }).limit(30).select('rawSourceData').lean();
    const sheetCols = new Set<string>();
    for (const s of sampleStudents) {
      if (s.rawSourceData) {
        for (const k of Object.keys(s.rawSourceData)) {
          if (k && k.trim()) sheetCols.add(k.trim());
        }
      }
    }

    const standardTags = [
      '{{student_name}}',
      '{{register_number}}',
      '{{father_name}}',
      '{{mother_name}}',
      '{{course}}',
      '{{department}}',
      '{{year}}',
      '{{section}}',
      '{{whatsapp_number}}',
      '{{total_fee}}',
      '{{paid_amount}}',
      '{{balance}}',
      '{{due_date}}',
      '{{fine_amount}}',
      '{{payment_link}}',
      '{{college_name}}'
    ];

    for (const col of sheetCols) {
      standardTags.push(`{{${col}}}`);
    }

    const apiKey = env.AI_PROVIDER_KEY || process.env.AI_PROVIDER_KEY;
    let polished = draft.trim();
    let corrections: string[] = [];
    let summary = 'Template reviewed';

    if (apiKey) {
      const models = ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'];
      const systemInstruction = `You are an expert educational communication assistant and variable validator for AlphaXync WhatsApp automations.
The administrator has drafted a WhatsApp automation message template.
The valid variable tags in this institution are:
${standardTags.join(', ')}

YOUR OBJECTIVES:
1. CURLED VARIABLE ACCURACY (CRITICAL):
   - Examine all {{...}} tags.
   - If you see misspelled or variant tags (e.g. {{studnt_nam}}, {{stident}}, {{name}}, {{student}}), replace them with the standard valid tag {{student_name}}.
   - If {{collg}}, {{clg_name}}, {{school}} -> replace with {{college_name}}.
   - If {{bal}}, {{balanc}}, {{balance_amt}} -> replace with {{balance}}.
   - If {{fee}}, {{totalfee}}, {{fee_amt}} -> replace with {{total_fee}}.
   - If {{fathr}}, {{parent}}, {{dad}} -> replace with {{father_name}}.
   - If the user wrote valid tags, preserve them exactly with their curly braces {{...}} intact!
2. GRAMMAR, SPELLING & TONE:
   - Fix grammatical errors, typos, and awkward phrasing.
   - Maintain a polite, professional, and welcoming tone suitable for educational communications.
3. PROFESSIONAL WHATSAPP FORMATTING:
   - Structure into clear, readable sections with pleasant line breaks.
   - Use WhatsApp bold formatting (*text*) for key details (e.g. *Due Date: {{due_date}}*).
   - Use subtle, appropriate emojis (👋, 📢, 📅, 💳).

CRITICAL RESPONSE FORMAT:
Respond ONLY with a valid JSON object. No Markdown code fences, no extra commentary:
{
  "polished": "the cleaned, formatted template message with valid {{tags}}",
  "corrections": ["Fixed {{studnt_nam}} to {{student_name}}", "Corrected spelling of 'orientation'"],
  "summary": "Fixed 1 variable typo and improved WhatsApp structure"
}`;

      for (const model of models) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const response = await axios.post(
            url,
            {
              system_instruction: { parts: [{ text: systemInstruction }] },
              contents: [{ role: 'user', parts: [{ text: `Draft to review:\n${draft}` }] }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1200
              }
            },
            { timeout: 15000 }
          );

          const rawReply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawReply) {
            const cleanJson = rawReply.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
            const parsed = JSON.parse(cleanJson);
            if (parsed.polished) {
              polished = parsed.polished;
              corrections = Array.isArray(parsed.corrections) ? parsed.corrections : [];
              summary = parsed.summary || 'AI auto-check complete';
              break;
            }
          }
        } catch (err: any) {
          logger.warn('AI_POLISH_MODEL_FALLBACK', `Model ${model} failed: ${err.message}`);
        }
      }
    }

    // Fallback if AI was unavailable or couldn't parse JSON
    if (corrections.length === 0 && polished === draft.trim()) {
      const variableReplacements: Record<string, string> = {
        studnt_name: 'student_name',
        studentname: 'student_name',
        studnt_nam: 'student_name',
        collg_name: 'college_name',
        clg_name: 'college_name',
        colleg_name: 'college_name',
        colleg: 'college_name',
        fathr_name: 'father_name',
        fathr: 'father_name',
        balanc: 'balance',
        bal: 'balance',
        fee_amt: 'total_fee',
        tot_fee: 'total_fee'
      };

      for (const [typo, fixed] of Object.entries(variableReplacements)) {
        const regex = new RegExp(`\\{\\{\\s*${typo}\\s*\\}\\}`, 'gi');
        if (regex.test(polished)) {
          polished = polished.replace(regex, `{{${fixed}}}`);
          corrections.push(`Auto-corrected {{${typo}}} to {{${fixed}}}`);
        }
      }

      if (corrections.length > 0) {
        summary = `Auto-corrected ${corrections.length} variable tags`;
      } else {
        summary = 'All variables and structure look good!';
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        polished,
        corrections,
        summary
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadMedia(req: Request, res: Response, next: NextFunction) {
  try {
    const { filename, base64 } = req.body;
    if (!base64 || !filename) {
      return res.status(400).json({ success: false, error: { message: 'Image data and filename are required' } });
    }

    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Clean base64 header if present
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const ext = path.extname(filename) || '.jpg';
    const safeName = `flyer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
    const filePath = path.join(uploadsDir, safeName);

    fs.writeFileSync(filePath, buffer);

    const protocol = req.protocol;
    const host = req.get('host') || `localhost:${env.PORT}`;
    const mediaUrl = `${protocol}://${host}/uploads/${safeName}`;

    return res.status(200).json({
      success: true,
      data: {
        mediaUrl,
        filename: safeName,
        size: buffer.length
      },
      message: 'Invitation card / flyer uploaded successfully.'
    });
  } catch (error) {
    next(error);
  }
}

