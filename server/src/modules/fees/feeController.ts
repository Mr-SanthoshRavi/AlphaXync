import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { FeeAccount } from '../../models/FeeAccount';
import { Student } from '../../models/Student';
import { Payment } from '../../models/Payment';
import { AuditLog } from '../../models/AuditLog';
import { Job } from '../../models/Job';
import { DataConnection } from '../../models/DataConnection';
import { AppError } from '../../middleware/errorHandler';
import { getAdapterForConnection } from '../sync/syncEngine';
import { logger } from '../../utils/logger';

export async function getFees(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { status, search, page = 1, limit = 25 } = req.query;

    const filter: any = { institutionId };
    if (status && status !== 'ALL') {
      filter.status = String(status).toUpperCase();
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(100, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const activeStudents = await Student.find({ institutionId, status: 'ACTIVE' }).select('_id');
    const activeStudentIds = activeStudents.map((s) => s._id);
    filter.studentId = { $in: activeStudentIds };

    let feeAccounts = await FeeAccount.find(filter)
      .populate('studentId')
      .sort({ dueDate: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // If search term provided, filter in-memory or by matching students
    if (search) {
      const q = String(search).toLowerCase();
      feeAccounts = feeAccounts.filter((f: any) => {
        const student = f.studentId;
        if (!student) return false;
        return (
          student.name.toLowerCase().includes(q) ||
          student.externalStudentId.toLowerCase().includes(q) ||
          (student.whatsappNumber && student.whatsappNumber.includes(q))
        );
      });
    }

    const total = await FeeAccount.countDocuments(filter);

    const feeAccountIds = feeAccounts.map((f: any) => f._id);
    const payments = await Payment.find({
      institutionId,
      feeAccountId: { $in: feeAccountIds },
      status: 'CAPTURED'
    })
      .sort({ createdAt: -1 })
      .lean();

    const paymentsByFee = new Map<string, any[]>();
    for (const p of payments) {
      const key = p.feeAccountId.toString();
      if (!paymentsByFee.has(key)) {
        paymentsByFee.set(key, []);
      }
      paymentsByFee.get(key)!.push({
        id: p._id.toString(),
        amount: p.amount,
        method: p.method,
        receiptNumber: p.receiptNumber || `REC-${p._id.toString().slice(-6).toUpperCase()}`,
        reference: p.reference,
        date: p.verifiedAt || p.createdAt,
        verifiedAt: p.verifiedAt,
        note: p.note
      });
    }

    const rows = feeAccounts.map((f: any) => {
      const feePayments = paymentsByFee.get(f._id.toString()) || [];
      return {
        id: f._id,
        studentId: f.studentId?._id,
        studentName: f.studentId?.name || 'Unknown',
        registerNo: f.studentId?.externalStudentId || 'N/A',
        course: f.studentId?.course || '',
        whatsappNumber: f.studentId?.whatsappNumber || '',
        feeType: f.feeType,
        total: f.totalAmount,
        paid: f.paidAmount,
        balance: f.balance,
        dueDate: f.dueDate,
        fine: f.fineAmount,
        status: f.status,
        payments: feePayments
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        fees: rows,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getFeeDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { id } = req.params;

    const feeAccount = await FeeAccount.findOne({ _id: id, institutionId })
      .populate('studentId')
      .lean();

    if (!feeAccount) {
      throw new AppError('FEE_ACCOUNT_NOT_FOUND', 'Fee account not found', 404);
    }

    const verifiedPayments = await Payment.find({
      institutionId,
      studentId: (feeAccount.studentId as any)._id,
      status: 'CAPTURED'
    }).lean();

    return res.status(200).json({
      success: true,
      data: {
        fee: {
          id: feeAccount._id,
          feeType: feeAccount.feeType,
          totalAmount: feeAccount.totalAmount,
          paidAmount: feeAccount.paidAmount,
          balance: feeAccount.balance,
          dueDate: feeAccount.dueDate,
          fineAmount: feeAccount.fineAmount,
          status: feeAccount.status
        },
        student: {
          id: (feeAccount.studentId as any)._id,
          name: (feeAccount.studentId as any).name,
          registerNo: (feeAccount.studentId as any).externalStudentId,
          course: (feeAccount.studentId as any).course,
          whatsappNumber: (feeAccount.studentId as any).whatsappNumber
        },
        verifiedPayments: verifiedPayments.map((p) => ({
          paymentId: p._id,
          providerPaymentId: p.providerPaymentId,
          amount: p.amount,
          method: p.method,
          verifiedAt: p.verifiedAt,
          receiptNumber: p.receiptNumber,
          reference: p.reference
        })),
        isVerifiedByPaymentSystem: verifiedPayments.length > 0
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/fees/categories
 * Auto-detect distinct courses, departments, and years from synced students
 * so the admin can set fee amounts per category.
 */
export async function getFeeCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);

    // Aggregate distinct category values with student counts
    const [courses, departments, years] = await Promise.all([
      Student.aggregate([
        { $match: { institutionId, status: 'ACTIVE' } },
        { $group: { _id: { $ifNull: ['$course', 'Uncategorized'] }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Student.aggregate([
        { $match: { institutionId, status: 'ACTIVE' } },
        { $group: { _id: { $ifNull: ['$department', 'Uncategorized'] }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Student.aggregate([
        { $match: { institutionId, status: 'ACTIVE' } },
        { $group: { _id: { $ifNull: ['$year', 'Uncategorized'] }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Also get total student count
    const totalStudents = await Student.countDocuments({ institutionId, status: 'ACTIVE' });

    // Get current fee structure snapshot: average prescribed total per category
    const currentFees = await FeeAccount.aggregate([
      { $match: { institutionId } },
      {
        $lookup: {
          from: 'students',
          localField: 'studentId',
          foreignField: '_id',
          as: 'student'
        }
      },
      { $unwind: '$student' },
      {
        $group: {
          _id: { course: '$student.course', department: '$student.department', year: '$student.year' },
          avgTotal: { $avg: '$totalAmount' },
          minTotal: { $min: '$totalAmount' },
          maxTotal: { $max: '$totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Build a lookup map: "course:BCA" -> { avg, min, max }
    const feeSnapshot: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    for (const row of currentFees) {
      if (row._id.course) feeSnapshot[`course:${row._id.course}`] = { avg: row.avgTotal, min: row.minTotal, max: row.maxTotal, count: row.count };
      if (row._id.department) feeSnapshot[`department:${row._id.department}`] = { avg: row.avgTotal, min: row.minTotal, max: row.maxTotal, count: row.count };
      if (row._id.year) feeSnapshot[`year:${row._id.year}`] = { avg: row.avgTotal, min: row.minTotal, max: row.maxTotal, count: row.count };
    }

    return res.status(200).json({
      success: true,
      data: {
        totalStudents,
        categories: {
          courses: courses.map(c => ({ value: c._id, studentCount: c.count, currentFee: feeSnapshot[`course:${c._id}`] })),
          departments: departments.map(d => ({ value: d._id, studentCount: d.count, currentFee: feeSnapshot[`department:${d._id}`] })),
          years: years.map(y => ({ value: y._id, studentCount: y.count, currentFee: feeSnapshot[`year:${y._id}`] }))
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/fees/set-fee-structure
 * Bulk-assign prescribed fee amounts by criteria (all, course, department, year).
 * Updates MongoDB FeeAccount.totalAmount and recalculates balance/status.
 * Queues Google Sheets write-back jobs to update the "Total Fee" and "Balance" columns.
 */
export async function setFeeStructure(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { mode, assignments } = req.body;
    // mode: 'all' | 'course' | 'department' | 'year'
    // assignments: Array<{ category: string, amount: number }>
    //   For 'all' mode: [{ category: 'ALL', amount: 50000 }]
    //   For 'course' mode: [{ category: 'BCA', amount: 45000 }, { category: 'BCom', amount: 40000 }]

    if (!mode || !assignments || !Array.isArray(assignments) || assignments.length === 0) {
      throw new AppError('INVALID_FEE_STRUCTURE', 'Mode and assignments array are required.', 400);
    }

    const validModes = ['all', 'course', 'department', 'year'];
    if (!validModes.includes(mode)) {
      throw new AppError('INVALID_MODE', `Mode must be one of: ${validModes.join(', ')}`, 400);
    }

    // Validate all amounts
    for (const a of assignments) {
      if (typeof a.amount !== 'number' || a.amount < 0) {
        throw new AppError('INVALID_AMOUNT', `Invalid fee amount for category "${a.category}": must be a positive number.`, 400);
      }
    }

    let totalUpdated = 0;
    let totalSheetJobsQueued = 0;
    const results: Array<{ category: string; amount: number; studentsAffected: number }> = [];

    for (const assignment of assignments) {
      const { category, amount } = assignment;
      const newTotal = Math.round(amount); // always integer rupees

      // Build student filter based on mode
      const studentFilter: any = { institutionId, status: 'ACTIVE' };
      if (mode === 'course') studentFilter.course = category;
      else if (mode === 'department') studentFilter.department = category;
      else if (mode === 'year') studentFilter.year = category;
      // 'all' mode: no extra filter

      // Find all matching students
      const students = await Student.find(studentFilter).select('_id externalStudentId sourceRowReference').lean();
      const studentIds = students.map(s => s._id);

      if (studentIds.length === 0) {
        results.push({ category, amount: newTotal, studentsAffected: 0 });
        continue;
      }

      // Update all matching fee accounts in one bulk write
      const feeAccounts = await FeeAccount.find({ institutionId, studentId: { $in: studentIds } });

      let updatedCount = 0;
      const sheetUpdatePromises: Promise<any>[] = [];

      for (const fa of feeAccounts) {
        const before = { totalAmount: fa.totalAmount, balance: fa.balance, status: fa.status };

        // Skip if amount is already the same
        if (fa.totalAmount === newTotal) continue;

        fa.totalAmount = newTotal;
        fa.balance = Math.max(0, newTotal - fa.paidAmount);
        fa.status = fa.balance === 0 ? 'PAID' : fa.paidAmount > 0 ? 'PARTIAL' : 'PENDING';
        await fa.save();

        updatedCount++;

        // Find the student's sourceRowReference for Google Sheets write-back
        const student = students.find(s => s._id.toString() === fa.studentId.toString());
        if (student?.sourceRowReference) {
          // Queue a sheet write-back job
          sheetUpdatePromises.push(
            Job.create({
              type: 'SHEET_WRITE_BACK',
              payload: {
                institutionId: institutionId.toString(),
                studentId: fa.studentId.toString(),
                receiptNumber: '',
                paidAmount: fa.paidAmount,
                balance: fa.balance,
                status: fa.status,
                totalFee: newTotal,
                writeBackFields: { 'Total Fee': newTotal, 'Balance': fa.balance, 'Payment Status': fa.status }
              },
              status: 'QUEUED'
            })
          );
          totalSheetJobsQueued++;
        }

        // Audit log per category batch (not per student)
        await AuditLog.create({
          institutionId,
          actorUserId: req.user!.userId,
          actorRole: req.user!.role,
          action: 'FEE_STRUCTURE_SET',
          entityType: 'FEE_ACCOUNT',
          entityId: fa._id.toString(),
          before,
          after: { totalAmount: fa.totalAmount, balance: fa.balance, status: fa.status },
          reason: `Fee structure set: ${mode}=${category}, Amount=₹${newTotal}`
        });
      }

      await Promise.all(sheetUpdatePromises);
      totalUpdated += updatedCount;
      results.push({ category, amount: newTotal, studentsAffected: updatedCount });
    }

    // Process queued sheet write-back jobs in background
    if (totalSheetJobsQueued > 0) {
      processSheetWriteBackBatch(institutionId).catch(err => {
        logger.error('FEE_STRUCTURE_SHEET_WRITEBACK_ERROR', `Background sheet write-back failed: ${err.message}`);
      });
    }

    logger.info('FEE_STRUCTURE_SET', `Admin set fee structure (${mode}): ${totalUpdated} accounts updated, ${totalSheetJobsQueued} sheet jobs queued`);

    return res.status(200).json({
      success: true,
      data: {
        mode,
        totalUpdated,
        totalSheetJobsQueued,
        results
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Background worker: processes all queued SHEET_WRITE_BACK jobs for fee structure changes.
 * Uses the existing sheetWriteBackWorker pattern but batches them efficiently.
 */
export async function processSheetWriteBackBatch(institutionId: Types.ObjectId): Promise<void> {
  const connection = await DataConnection.findOne({ institutionId });
  if (!connection) {
    logger.warn('FEE_STRUCTURE_NO_CONNECTION', 'No data connection found for sheet write-back');
    return;
  }

  const adapter = await getAdapterForConnection(connection);
  if (connection.provider === 'google_sheets') {
    try {
      const { getValidGoogleCredentials } = await import('../connections/googleConnectionController');
      const googleCreds = await getValidGoogleCredentials(connection);
      await adapter.connect({
        accessToken: googleCreds.accessToken,
        spreadsheetId: googleCreds.spreadsheetId || connection.fileReference || connection.sheetReference
      });
    } catch (err: any) {
      logger.error('FEE_STRUCTURE_CONNECT_ERROR', `Failed to connect for write-back: ${err.message}`);
      return;
    }
  }

  const sheetName = connection.sheetReference || 'Students_Master';
  const pendingJobs = await Job.find({ type: 'SHEET_WRITE_BACK', status: 'QUEUED' }).sort({ createdAt: 1 }).limit(500);

  let successCount = 0;
  let failCount = 0;

  for (const job of pendingJobs) {
    try {
      const { studentId } = job.payload;
      const student = await Student.findById(studentId);
      if (!student?.sourceRowReference) {
        job.status = 'SKIPPED';
        await job.save();
        continue;
      }

      const updates: Record<string, any> = {};
      if (job.payload.writeBackFields) {
        Object.assign(updates, job.payload.writeBackFields);
      } else {
        updates['Paid Amount'] = job.payload.paidAmount;
        updates['Balance'] = job.payload.balance;
        updates['Payment Status'] = job.payload.status;
        if (job.payload.receiptNumber) updates['Receipt No'] = job.payload.receiptNumber;
        updates['Last Payment Date'] = new Date().toISOString().slice(0, 10);
      }

      const success = await adapter.updateRow(sheetName, student.sourceRowReference, updates);
      job.status = success ? 'COMPLETED' : 'FAILED';
      job.completedAt = new Date();
      await job.save();

      if (success) successCount++;
      else failCount++;

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    } catch (err: any) {
      job.status = 'FAILED';
      job.lastError = err.message;
      await job.save();
      failCount++;
    }
  }

  logger.info('FEE_STRUCTURE_SHEET_WRITEBACK_DONE', `Batch write-back complete: ${successCount} success, ${failCount} failed out of ${pendingJobs.length} jobs`);
}

/**
 * GET /api/fees/discover-dimensions
 * Scans rawSourceData across all active students to discover dynamic fee targeting criteria
 */
export async function discoverDimensions(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const students = await Student.find({ institutionId, status: 'ACTIVE' }).select('rawSourceData').lean();
    
    const dimensionMap = new Map<string, Map<string, number>>(); // field -> (value -> count)
    
    for (const student of students) {
      if (!student.rawSourceData) continue;
      
      for (const [key, value] of Object.entries(student.rawSourceData)) {
        if (!value || typeof value !== 'string') continue;
        
        // Skip some standard columns that aren't good criteria
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('name') || lowerKey.includes('id') || lowerKey.includes('number') || lowerKey.includes('fee') || lowerKey.includes('amount') || lowerKey.includes('date') || lowerKey.includes('status')) {
          continue;
        }
        
        const val = value.trim();
        if (!val) continue;
        
        if (!dimensionMap.has(key)) {
          dimensionMap.set(key, new Map());
        }
        
        const valCounts = dimensionMap.get(key)!;
        valCounts.set(val, (valCounts.get(val) || 0) + 1);
      }
    }
    
    const dimensions = Array.from(dimensionMap.entries()).map(([field, valMap]) => {
      const studentCounts = Object.fromEntries(valMap.entries());
      return {
        field,
        values: Array.from(valMap.keys()).sort(),
        studentCounts
      };
    }).sort((a, b) => b.values.length - a.values.length); // Sort by most diverse fields

    return res.status(200).json({
      success: true,
      data: { dimensions }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/fees/rules
 * List all fee rules
 */
export async function getFeeRules(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const rules = await import('../../models/FeeRule').then(m => m.FeeRule.find({ institutionId }).sort({ createdAt: -1 }));
    
    return res.status(200).json({
      success: true,
      data: { rules }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/fees/preview-rule-match
 * Live preview of how many and which students match criteria before creating a rule
 */
export async function previewRuleMatch(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { criteria } = req.body;
    
    const { findMatchingStudents } = await import('./feeRuleEngine');
    const matchingStudents = await findMatchingStudents(institutionId, criteria || []);
    
    const studentsPreview = matchingStudents.slice(0, 10).map((s: any) => ({
      id: s._id,
      name: s.name,
      registerNo: s.externalStudentId,
      course: s.course,
      year: s.year,
      department: s.department,
      section: s.section
    }));

    return res.status(200).json({
      success: true,
      data: {
        count: matchingStudents.length,
        students: studentsPreview
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/fees/rules
 * Create a new fee rule and auto-apply it
 */
export async function createFeeRule(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { name, feeType, academicYear, criteria, amount, dueDate, fineAmount } = req.body;
    
    const { FeeRule } = await import('../../models/FeeRule');
    const rule = await FeeRule.create({
      institutionId,
      name,
      feeType: feeType || 'Tuition Fee',
      academicYear: academicYear || '2026-27',
      criteria: criteria || [],
      amount: Number(amount),
      dueDate: new Date(dueDate),
      fineAmount: Number(fineAmount) || 0,
      isActive: true
    });
    
    // Auto apply immediately
    const { findMatchingStudents, applyFeeRule } = await import('./feeRuleEngine');
    const students = await findMatchingStudents(institutionId, rule.criteria);
    const updated = await applyFeeRule(rule, students);
    
    rule.appliedCount = students.length;
    await rule.save();

    // Trigger immediate sheet writeback
    if (students.length > 0) {
      processSheetWriteBackBatch(institutionId).catch(err => {
        logger.error('FEE_WRITEBACK', `Background sheet writeback failed: ${err.message}`);
      });
    }

    // Broadcast SSE update so frontend automatically refreshes
    try {
      const { broadcastEvent } = await import('../events/eventStream');
      broadcastEvent(institutionId.toString(), 'DATA_UPDATED', {
        type: 'DATA_UPDATED',
        source: 'fee_rule_engine',
        timestamp: new Date().toISOString()
      });
    } catch (e) {}
    
    return res.status(201).json({
      success: true,
      data: {
        rule,
        studentsAffected: updated
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/fees/rules/:id
 * Delete (or deactivate) a fee rule
 */
export async function deleteFeeRule(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { FeeRule } = await import('../../models/FeeRule');
    await FeeRule.findOneAndDelete({ _id: req.params.id, institutionId });
    
    // Re-apply remaining active rules
    const { applyAllActiveRules } = await import('./feeRuleEngine');
    await applyAllActiveRules(institutionId);

    // Broadcast SSE update so frontend automatically refreshes
    try {
      const { broadcastEvent } = await import('../events/eventStream');
      broadcastEvent(institutionId.toString(), 'DATA_UPDATED', {
        type: 'DATA_UPDATED',
        source: 'fee_rule_engine',
        timestamp: new Date().toISOString()
      });
    } catch (e) {}

    return res.status(200).json({
      success: true,
      data: { message: 'Rule deleted successfully' }
    });
  } catch (error) {
    next(error);
  }
}
