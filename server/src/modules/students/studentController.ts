import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Student } from '../../models/Student';
import { FeeAccount } from '../../models/FeeAccount';
import { Payment } from '../../models/Payment';
import { Message } from '../../models/Message';
import { SyncConflict } from '../../models/SyncConflict';
import { DataConnection } from '../../models/DataConnection';
import { AppError } from '../../middleware/errorHandler';

export async function getStudents(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { search, course, year, section, paymentStatus, whatsappStatus, status, page = 1, limit = 25 } = req.query;

    const filter: any = { institutionId };

    if (!status) {
      filter.status = 'ACTIVE';
    } else if (status !== 'ALL') {
      filter.status = String(status).toUpperCase();
    }

    if (search) {
      const regex = new RegExp(String(search), 'i');
      filter.$or = [{ name: regex }, { externalStudentId: regex }, { whatsappNumber: regex }];
    }

    if (course) filter.course = String(course);
    if (year) filter.year = String(year);
    if (section) filter.section = String(section);

    if (whatsappStatus === 'valid') {
      filter.validationStatus = 'VALID';
    } else if (whatsappStatus === 'invalid') {
      filter.$or = [{ whatsappNumber: { $exists: false } }, { whatsappNumber: '' }, { validationStatus: 'INVALID' }];
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(100, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Check if institution's spreadsheet is actively linked & connected
    const connection = await DataConnection.findOne({ institutionId, provider: 'google_sheets' });
    const isSourceActive = connection && connection.status === 'CONNECTED' && !!connection.fileReference;

    // If source spreadsheet is unlinked/disconnected, return empty roster for active queries
    if (!isSourceActive && (!status || status === 'ACTIVE')) {
      return res.status(200).json({
        success: true,
        data: {
          students: [],
          pagination: {
            total: 0,
            page: 1,
            limit: limitNum,
            pages: 0
          },
          isSourceActive: false,
          connectionStatus: connection?.status || 'DISCONNECTED'
        }
      });
    }

    // Fetch students
    const [students, total] = await Promise.all([
      Student.find(filter).sort({ externalStudentId: 1 }).skip(skip).limit(limitNum).lean(),
      Student.countDocuments(filter)
    ]);

    // Fetch fee accounts for these students
    const studentIds = students.map((s) => s._id);
    const feeAccounts = await FeeAccount.find({
      institutionId,
      studentId: { $in: studentIds }
    }).lean();

    const feeMap = new Map(feeAccounts.map((f) => [f.studentId.toString(), f]));

    const combined = students.map((s) => {
      const fee = feeMap.get(s._id.toString());
      return {
        id: s._id,
        externalStudentId: s.externalStudentId,
        name: s.name,
        fatherName: s.fatherName,
        whatsappNumber: s.whatsappNumber,
        course: s.course,
        department: s.department,
        year: s.year,
        section: s.section,
        status: s.status,
        validationStatus: s.validationStatus,
        sourceProvider: s.sourceProvider || 'google_sheets',
        sourceSheetId: s.sourceSheetId || 'Students_Master',
        sourceRowReference: s.sourceRowReference,
        lastSourceSyncAt: s.lastSourceSyncAt,
        fee: fee
          ? {
              id: fee._id,
              feeAccountId: fee._id,
              total: fee.totalAmount,
              paid: fee.paidAmount,
              balance: fee.balance,
              dueDate: fee.dueDate,
              fine: fee.fineAmount,
              status: fee.status
            }
          : {
              id: null,
              feeAccountId: null,
              total: 0,
              paid: 0,
              balance: 0,
              status: 'PENDING'
            }
      };
    });

    // If filtered by payment status
    const filteredResults = paymentStatus
      ? combined.filter((s) => s.fee.status.toUpperCase() === String(paymentStatus).toUpperCase())
      : combined;

    return res.status(200).json({
      success: true,
      data: {
        students: filteredResults,
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

export async function getStudentDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { id } = req.params;

    const student = await Student.findOne({ _id: id, institutionId }).lean();
    if (!student) {
      throw new AppError('STUDENT_NOT_FOUND', 'Student record not found', 404);
    }

    const feeAccount = await FeeAccount.findOne({ institutionId, studentId: student._id }).lean();

    const paymentHistory = await Payment.find({ institutionId, studentId: student._id })
      .sort({ createdAt: -1 })
      .lean();

    const messageHistory = await Message.find({ institutionId, studentId: student._id })
      .sort({ sentAt: -1 })
      .limit(20)
      .lean();

    const openConflict = await SyncConflict.findOne({
      institutionId,
      studentId: student._id,
      status: 'OPEN'
    }).lean();

    return res.status(200).json({
      success: true,
      data: {
        student: {
          id: student._id,
          externalStudentId: student.externalStudentId,
          name: student.name,
          fatherName: student.fatherName,
          motherName: student.motherName,
          whatsappNumber: student.whatsappNumber,
          course: student.course,
          department: student.department,
          year: student.year,
          section: student.section,
          status: student.status,
          validationStatus: student.validationStatus,
          validationIssues: student.validationIssues,
          lastSourceSyncAt: student.lastSourceSyncAt,
          sourceProvider: student.sourceProvider || 'google_sheets',
          sourceSheetId: student.sourceSheetId || 'Students_Master',
          sourceRowReference: student.sourceRowReference
        },
        feeSummary: feeAccount
          ? {
              id: feeAccount._id.toString(),
              total: feeAccount.totalAmount,
              paid: feeAccount.paidAmount,
              balance: feeAccount.balance,
              dueDate: feeAccount.dueDate,
              fineDate: feeAccount.fineDate,
              fineAmount: feeAccount.fineAmount,
              status: feeAccount.status
            }
          : null,
        paymentHistory: paymentHistory.map((p) => ({
          id: p._id,
          amount: p.amount,
          method: p.method,
          provider: p.provider,
          status: p.status,
          verifiedAt: p.verifiedAt,
          reference: p.reference,
          receiptNumber: p.receiptNumber,
          note: p.note
        })),
        messageHistory: messageHistory.map((m) => ({
          id: m._id,
          recipient: m.recipient,
          templateName: m.templateName,
          status: m.status,
          sentAt: m.sentAt,
          failureReason: m.failureReason
        })),
        conflict: openConflict
          ? {
              id: openConflict._id,
              field: openConflict.field,
              applicationValue: openConflict.applicationValue,
              sourceValue: openConflict.sourceValue,
              detectedAt: openConflict.detectedAt
            }
          : null
      }
    });
  } catch (error) {
    next(error);
  }
}
