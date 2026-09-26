import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import * as XLSX from 'xlsx';
import { Student } from '../../models/Student';
import { FeeAccount } from '../../models/FeeAccount';
import { Payment } from '../../models/Payment';
import { Message } from '../../models/Message';
import { SyncConflict } from '../../models/SyncConflict';
import { DataConnection } from '../../models/DataConnection';
import { AppError } from '../../middleware/errorHandler';
import { isMockMode } from '../../config/env';
import { normalizePhoneNumber, parseFlexibleDate } from '../sync/validationEngine';

function getAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 is Jan, 5 is June
  return month >= 5 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function normalizeHeader(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const HEADER_KEY_MAP: Record<string, string> = {
  regno: 'externalStudentId',
  registerno: 'externalStudentId',
  registernumber: 'externalStudentId',
  rollno: 'externalStudentId',
  rollnumber: 'externalStudentId',
  studentid: 'externalStudentId',
  id: 'externalStudentId',
  name: 'name',
  studentname: 'name',
  fullname: 'name',
  fathername: 'fatherName',
  parentname: 'fatherName',
  guardianname: 'fatherName',
  mothername: 'motherName',
  phone: 'whatsappNumber',
  phoneno: 'whatsappNumber',
  phonenumber: 'whatsappNumber',
  mobile: 'whatsappNumber',
  mobileno: 'whatsappNumber',
  mobilenumber: 'whatsappNumber',
  whatsapp: 'whatsappNumber',
  whatsappno: 'whatsappNumber',
  whatsappnumber: 'whatsappNumber',
  contact: 'whatsappNumber',
  course: 'course',
  degree: 'course',
  program: 'course',
  department: 'department',
  dept: 'department',
  branch: 'department',
  year: 'year',
  academicperiod: 'year',
  section: 'section',
  sec: 'section',
  totalfee: 'totalFee',
  totalamount: 'totalFee',
  fees: 'totalFee',
  fee: 'totalFee',
  paidamount: 'paidAmount',
  paid: 'paidAmount',
  duedate: 'dueDate',
  fineamount: 'fineAmount',
  fine: 'fineAmount'
};

export async function getStudents(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const {
      search,
      course,
      year,
      section,
      paymentStatus,
      whatsappStatus,
      status,
      sourceProvider,
      page = 1,
      limit = 25
    } = req.query;

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

    if (sourceProvider === 'native_sheet') {
      filter.sourceProvider = { $in: ['native_sheet', 'excel_import', 'manual'] };
    } else if (sourceProvider === 'google_sheets') {
      filter.sourceProvider = 'google_sheets';
    } else if (sourceProvider && sourceProvider !== 'all') {
      filter.sourceProvider = String(sourceProvider);
    }

    if (whatsappStatus === 'valid') {
      filter.validationStatus = 'VALID';
    } else if (whatsappStatus === 'invalid') {
      filter.$or = [{ whatsappNumber: { $exists: false } }, { whatsappNumber: '' }, { validationStatus: 'INVALID' }];
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(500, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Check if institution's external spreadsheet is actively linked
    const connection = await DataConnection.findOne({ institutionId, provider: 'google_sheets' });
    const isGoogleActive =
      isMockMode() ||
      process.env.NODE_ENV === 'test' ||
      Boolean(
        connection &&
        connection.status === 'CONNECTED' &&
        (connection.fileReference || connection.sheetReference)
      );

    // If querying specifically for google_sheets and it's disconnected
    if (sourceProvider === 'google_sheets' && !isGoogleActive && (!status || status === 'ACTIVE')) {
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
          connectionStatus: connection?.status || 'DISCONNECTED',
          googleConnection: connection ? {
            status: connection.status,
            accountReference: connection.accountReference,
            sheetReference: connection.sheetReference,
            lastSyncAt: connection.lastSyncAt
          } : null
        }
      });
    }

    // If no specific sourceProvider is chosen (or 'all') and Google Sheets is disconnected:
    // Retain and show native & excel records without returning an empty roster!
    if ((!sourceProvider || sourceProvider === 'all') && !isGoogleActive && (!status || status === 'ACTIVE')) {
      const nativeExists = await Student.exists({
        institutionId,
        sourceProvider: { $in: ['native_sheet', 'excel_import', 'manual'] }
      });
      if (!nativeExists) {
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
      } else {
        // Exclude google_sheets records while unlinked, but seamlessly display native & excel students!
        filter.sourceProvider = { $ne: 'google_sheets' };
      }
    }

    // Fetch students
    const [students, total] = await Promise.all([
      Student.find(filter).sort({ createdAt: -1, externalStudentId: 1 }).skip(skip).limit(limitNum).lean(),
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
        motherName: s.motherName,
        whatsappNumber: s.whatsappNumber,
        course: s.course,
        department: s.department,
        year: s.year,
        section: s.section,
        status: s.status,
        validationStatus: s.validationStatus,
        sourceProvider: s.sourceProvider || 'google_sheets',
        sourceSheetId: s.sourceSheetId || 'AlphaSheet',
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

    const [nativeCount, googleCount] = await Promise.all([
      Student.countDocuments({ institutionId, sourceProvider: { $in: ['native_sheet', 'excel_import', 'manual'] } }),
      Student.countDocuments({ institutionId, sourceProvider: 'google_sheets' })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        students: filteredResults,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        },
        counts: {
          native: nativeCount,
          google: googleCount
        },
        isSourceActive: isGoogleActive,
        connectionStatus: isGoogleActive ? 'CONNECTED' : connection?.status || 'DISCONNECTED',
        googleConnection: connection ? {
          status: connection.status,
          accountReference: connection.accountReference,
          sheetReference: connection.sheetReference,
          lastSyncAt: connection.lastSyncAt
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function createStudent(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const {
      externalStudentId,
      name,
      fatherName,
      motherName,
      whatsappNumber,
      course,
      department,
      year,
      section,
      academicYear: reqAcademicYear,
      totalFee = 0,
      paidAmount = 0,
      dueDate,
      fineAmount = 0
    } = req.body;

    if (!externalStudentId || !String(externalStudentId).trim()) {
      throw new AppError('VALIDATION_ERROR', 'Roll / Register No is required', 400);
    }
    if (!name || !String(name).trim()) {
      throw new AppError('VALIDATION_ERROR', 'Student Name is required', 400);
    }

    const trimmedId = String(externalStudentId).trim();
    const academicYear = reqAcademicYear ? String(reqAcademicYear).trim() : getAcademicYear();

    const existing = await Student.findOne({
      institutionId,
      academicYear,
      externalStudentId: trimmedId
    });

    if (existing) {
      throw new AppError(
        'STUDENT_EXISTS',
        `A student with Roll No "${trimmedId}" already exists for Academic Year ${academicYear}`,
        409
      );
    }

    const normPhone = normalizePhoneNumber(whatsappNumber);
    const validationStatus = normPhone ? 'VALID' : 'INVALID';
    const validationIssues = normPhone ? [] : ['Missing or invalid E.164 WhatsApp number'];

    const student = await Student.create({
      institutionId,
      academicYear,
      externalStudentId: trimmedId,
      sourceProvider: 'native_sheet',
      sourceSheetId: 'AlphaSheet_Studio',
      name: String(name).trim(),
      fatherName: fatherName ? String(fatherName).trim() : undefined,
      motherName: motherName ? String(motherName).trim() : undefined,
      whatsappNumber: normPhone || (whatsappNumber ? String(whatsappNumber).trim() : ''),
      course: course ? String(course).trim() : undefined,
      department: department ? String(department).trim() : undefined,
      year: year ? String(year).trim() : undefined,
      section: section ? String(section).trim() : undefined,
      status: 'ACTIVE',
      validationStatus,
      validationIssues,
      lastSourceSyncAt: new Date()
    });

    const parsedTotal = Math.max(0, Number(totalFee) || 0);
    const parsedPaid = Math.max(0, Number(paidAmount) || 0);
    const balance = Math.max(0, parsedTotal - parsedPaid);
    const parsedDueDate = parseFlexibleDate(dueDate) || new Date(Date.now() + 30 * 24 * 3600 * 1000);

    const feeAccount = await FeeAccount.create({
      institutionId,
      studentId: student._id,
      academicYear,
      feeType: 'Tuition Fee',
      totalAmount: parsedTotal,
      paidAmount: parsedPaid,
      balance,
      dueDate: parsedDueDate,
      fineAmount: Number(fineAmount) || 0,
      status: balance === 0 ? 'PAID' : parsedPaid > 0 ? 'PARTIAL' : 'PENDING'
    });

    return res.status(201).json({
      success: true,
      message: 'Student record created in AlphaSheet successfully',
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
          sourceProvider: student.sourceProvider,
          sourceSheetId: student.sourceSheetId,
          fee: {
            id: feeAccount._id,
            feeAccountId: feeAccount._id,
            total: feeAccount.totalAmount,
            paid: feeAccount.paidAmount,
            balance: feeAccount.balance,
            dueDate: feeAccount.dueDate,
            fine: feeAccount.fineAmount,
            status: feeAccount.status
          }
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function updateStudent(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { id } = req.params;
    const {
      name,
      fatherName,
      motherName,
      whatsappNumber,
      course,
      department,
      year,
      section,
      status,
      totalFee,
      dueDate,
      fineAmount
    } = req.body;

    const student = await Student.findOne({ _id: id, institutionId });
    if (!student) {
      throw new AppError('STUDENT_NOT_FOUND', 'Student record not found', 404);
    }

    if (name !== undefined) student.name = String(name).trim();
    if (fatherName !== undefined) student.fatherName = String(fatherName).trim();
    if (motherName !== undefined) student.motherName = String(motherName).trim();
    if (course !== undefined) student.course = String(course).trim();
    if (department !== undefined) student.department = String(department).trim();
    if (year !== undefined) student.year = String(year).trim();
    if (section !== undefined) student.section = String(section).trim();
    if (status !== undefined) student.status = status;

    if (whatsappNumber !== undefined) {
      const norm = normalizePhoneNumber(whatsappNumber);
      student.whatsappNumber = norm || (whatsappNumber ? String(whatsappNumber).trim() : '');
      student.validationStatus = norm ? 'VALID' : 'INVALID';
      student.validationIssues = norm ? [] : ['Invalid or missing E.164 WhatsApp number'];
    }

    student.lastSourceSyncAt = new Date();
    await student.save();

    let feeAccount = await FeeAccount.findOne({ institutionId, studentId: student._id });
    if (feeAccount) {
      let feeChanged = false;
      if (totalFee !== undefined) {
        const newTotal = Math.max(0, Number(totalFee) || 0);
        feeAccount.totalAmount = newTotal;
        feeAccount.balance = Math.max(0, newTotal - feeAccount.paidAmount);
        feeAccount.status = feeAccount.balance === 0 ? 'PAID' : feeAccount.paidAmount > 0 ? 'PARTIAL' : 'PENDING';
        feeChanged = true;
      }
      if (dueDate !== undefined) {
        const parsedDue = parseFlexibleDate(dueDate);
        if (parsedDue) {
          feeAccount.dueDate = parsedDue;
          feeChanged = true;
        }
      }
      if (fineAmount !== undefined) {
        feeAccount.fineAmount = Number(fineAmount) || 0;
        feeChanged = true;
      }
      if (feeChanged) {
        await feeAccount.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Student record updated',
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
          sourceProvider: student.sourceProvider,
          fee: feeAccount
            ? {
                id: feeAccount._id,
                total: feeAccount.totalAmount,
                paid: feeAccount.paidAmount,
                balance: feeAccount.balance,
                dueDate: feeAccount.dueDate,
                status: feeAccount.status
              }
            : null
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteStudent(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { id } = req.params;
    const { permanent } = req.query;

    const student = await Student.findOne({ _id: id, institutionId });
    if (!student) {
      throw new AppError('STUDENT_NOT_FOUND', 'Student record not found', 404);
    }

    if (permanent === 'true' || student.sourceProvider === 'native_sheet' || student.sourceProvider === 'excel_import') {
      await Promise.all([
        Student.deleteOne({ _id: student._id }),
        FeeAccount.deleteMany({ institutionId, studentId: student._id })
      ]);
      return res.status(200).json({
        success: true,
        message: 'Student record and fee account deleted permanently'
      });
    } else {
      student.status = 'INACTIVE';
      await student.save();
      return res.status(200).json({
        success: true,
        message: 'Student record set to INACTIVE'
      });
    }
  } catch (error) {
    next(error);
  }
}

export async function batchSaveStudents(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(200).json({ success: true, updatedCount: 0 });
    }

    let updatedCount = 0;
    const CHUNK_SIZE = 25;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (item: any) => {
          if (!item.id) return;
          const student = await Student.findOne({ _id: item.id, institutionId });
          if (!student) return;

          let studentChanged = false;
          if (item.name !== undefined && item.name !== student.name) {
            student.name = String(item.name).trim();
            studentChanged = true;
          }
          if (item.fatherName !== undefined && item.fatherName !== student.fatherName) {
            student.fatherName = String(item.fatherName).trim();
            studentChanged = true;
          }
          if (item.whatsappNumber !== undefined && item.whatsappNumber !== student.whatsappNumber) {
            const norm = normalizePhoneNumber(item.whatsappNumber);
            student.whatsappNumber = norm || (item.whatsappNumber ? String(item.whatsappNumber).trim() : '');
            student.validationStatus = norm ? 'VALID' : 'INVALID';
            student.validationIssues = norm ? [] : ['Invalid or missing E.164 WhatsApp number'];
            studentChanged = true;
          }
          if (item.course !== undefined && item.course !== student.course) {
            student.course = String(item.course).trim();
            studentChanged = true;
          }
          if (item.department !== undefined && item.department !== student.department) {
            student.department = String(item.department).trim();
            studentChanged = true;
          }
          if (item.year !== undefined && item.year !== student.year) {
            student.year = String(item.year).trim();
            studentChanged = true;
          }
          if (item.section !== undefined && item.section !== student.section) {
            student.section = String(item.section).trim();
            studentChanged = true;
          }

          if (studentChanged) {
            student.lastSourceSyncAt = new Date();
            await student.save();
          }

          if (item.totalFee !== undefined || item.dueDate !== undefined) {
            const feeAccount = await FeeAccount.findOne({ institutionId, studentId: student._id });
            if (feeAccount) {
              let feeChanged = false;
              if (item.totalFee !== undefined) {
                const newTotal = Math.max(0, Number(item.totalFee) || 0);
                if (newTotal !== feeAccount.totalAmount) {
                  feeAccount.totalAmount = newTotal;
                  feeAccount.balance = Math.max(0, newTotal - feeAccount.paidAmount);
                  feeAccount.status = feeAccount.balance === 0 ? 'PAID' : feeAccount.paidAmount > 0 ? 'PARTIAL' : 'PENDING';
                  feeChanged = true;
                }
              }
              if (item.dueDate !== undefined) {
                const parsedDue = parseFlexibleDate(item.dueDate);
                if (parsedDue && (!feeAccount.dueDate || parsedDue.getTime() !== feeAccount.dueDate.getTime())) {
                  feeAccount.dueDate = parsedDue;
                  feeChanged = true;
                }
              }
              if (feeChanged) {
                await feeAccount.save();
              }
            }
          }
          updatedCount++;
        })
      );
    }

    return res.status(200).json({
      success: true,
      message: `Batch update completed (${updatedCount} records)`,
      updatedCount
    });
  } catch (error) {
    next(error);
  }
}

export async function parseImportFile(req: Request, res: Response, next: NextFunction) {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) {
      throw new AppError('FILE_REQUIRED', 'No file content uploaded', 400);
    }

    const buffer = Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new AppError('INVALID_FILE', 'The uploaded file does not contain any sheets', 400);
    }

    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

    if (rawRows.length === 0) {
      return res.status(200).json({
        success: true,
        sheetNames: workbook.SheetNames,
        selectedSheet: firstSheetName,
        headers: [],
        totalRows: 0,
        previewRows: [],
        detectedMapping: {},
        allRows: []
      });
    }

    const headers = Object.keys(rawRows[0]);
    const detectedMapping: Record<string, string> = {};
    for (const h of headers) {
      const norm = normalizeHeader(h);
      if (HEADER_KEY_MAP[norm]) {
        detectedMapping[h] = HEADER_KEY_MAP[norm];
      }
    }

    return res.status(200).json({
      success: true,
      sheetNames: workbook.SheetNames,
      selectedSheet: firstSheetName,
      headers,
      totalRows: rawRows.length,
      previewRows: rawRows.slice(0, 10),
      detectedMapping,
      allRows: rawRows
    });
  } catch (error) {
    next(error);
  }
}

export async function bulkImportStudents(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const {
      rows,
      academicYear: reqAcademicYear,
      updateExisting = false,
      columnMapping = {},
      defaultFee = 0,
      defaultDueDate
    } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new AppError('DATA_REQUIRED', 'No rows provided for import', 400);
    }

    const academicYear = reqAcademicYear ? String(reqAcademicYear).trim() : getAcademicYear();
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ row: number; error: string; data?: any }> = [];

    const defaultDue = parseFlexibleDate(defaultDueDate) || new Date(Date.now() + 30 * 24 * 3600 * 1000);

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const rowNum = i + 1;

      const mapped: Record<string, any> = {};
      for (const [key, val] of Object.entries(raw)) {
        const targetField = columnMapping[key] || HEADER_KEY_MAP[normalizeHeader(key)];
        if (targetField) {
          mapped[targetField] = val;
        }
      }

      const externalId = mapped.externalStudentId ? String(mapped.externalStudentId).trim() : '';
      if (!externalId) {
        errors.push({ row: rowNum, error: 'Missing Roll / Register No' });
        skippedCount++;
        continue;
      }

      const name = mapped.name ? String(mapped.name).trim() : '';
      if (!name) {
        errors.push({ row: rowNum, error: `Missing Student Name for Roll No ${externalId}` });
        skippedCount++;
        continue;
      }

      const normPhone = normalizePhoneNumber(mapped.whatsappNumber);
      const validationStatus = normPhone ? 'VALID' : 'INVALID';
      const validationIssues = normPhone ? [] : ['Missing or invalid E.164 WhatsApp number'];

      let existing = await Student.findOne({
        institutionId,
        academicYear,
        externalStudentId: externalId
      });

      if (existing) {
        if (!updateExisting) {
          skippedCount++;
          continue;
        }

        existing.name = name;
        if (mapped.fatherName) existing.fatherName = String(mapped.fatherName).trim();
        if (mapped.motherName) existing.motherName = String(mapped.motherName).trim();
        if (mapped.course) existing.course = String(mapped.course).trim();
        if (mapped.department) existing.department = String(mapped.department).trim();
        if (mapped.year) existing.year = String(mapped.year).trim();
        if (mapped.section) existing.section = String(mapped.section).trim();
        existing.whatsappNumber = normPhone || (mapped.whatsappNumber ? String(mapped.whatsappNumber).trim() : existing.whatsappNumber);
        existing.validationStatus = validationStatus;
        existing.validationIssues = validationIssues;
        existing.lastSourceSyncAt = new Date();
        await existing.save();

        if (mapped.totalFee !== undefined) {
          const feeAccount = await FeeAccount.findOne({ institutionId, studentId: existing._id });
          if (feeAccount) {
            const newTotal = Math.max(0, Number(mapped.totalFee) || 0);
            feeAccount.totalAmount = newTotal;
            feeAccount.balance = Math.max(0, newTotal - feeAccount.paidAmount);
            feeAccount.status = feeAccount.balance === 0 ? 'PAID' : feeAccount.paidAmount > 0 ? 'PARTIAL' : 'PENDING';
            if (mapped.dueDate) {
              const parsedDue = parseFlexibleDate(mapped.dueDate);
              if (parsedDue) feeAccount.dueDate = parsedDue;
            }
            await feeAccount.save();
          }
        }
        updatedCount++;
      } else {
        const student = await Student.create({
          institutionId,
          academicYear,
          externalStudentId: externalId,
          sourceProvider: 'excel_import',
          sourceSheetId: 'Excel_Upload',
          sourceRowReference: `Row_${rowNum}`,
          name,
          fatherName: mapped.fatherName ? String(mapped.fatherName).trim() : undefined,
          motherName: mapped.motherName ? String(mapped.motherName).trim() : undefined,
          whatsappNumber: normPhone || (mapped.whatsappNumber ? String(mapped.whatsappNumber).trim() : ''),
          course: mapped.course ? String(mapped.course).trim() : undefined,
          department: mapped.department ? String(mapped.department).trim() : undefined,
          year: mapped.year ? String(mapped.year).trim() : undefined,
          section: mapped.section ? String(mapped.section).trim() : undefined,
          status: 'ACTIVE',
          validationStatus,
          validationIssues,
          lastSourceSyncAt: new Date()
        });

        const totalAmount = mapped.totalFee !== undefined ? Math.max(0, Number(mapped.totalFee) || 0) : Number(defaultFee) || 0;
        const paidAmount = mapped.paidAmount !== undefined ? Math.max(0, Number(mapped.paidAmount) || 0) : 0;
        const balance = Math.max(0, totalAmount - paidAmount);
        const dueDate = mapped.dueDate ? (parseFlexibleDate(mapped.dueDate) || defaultDue) : defaultDue;

        await FeeAccount.create({
          institutionId,
          studentId: student._id,
          academicYear,
          feeType: 'Tuition Fee',
          totalAmount,
          paidAmount,
          balance,
          dueDate,
          fineAmount: mapped.fineAmount ? Number(mapped.fineAmount) || 0 : 0,
          status: balance === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING'
        });

        addedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Import processed: ${addedCount} added, ${updatedCount} updated, ${skippedCount} skipped`,
      data: {
        totalRows: rows.length,
        added: addedCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function exportStudents(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { format = 'xlsx', sourceProvider, search, course, year, section, paymentStatus, status } = req.query;

    const filter: any = { institutionId };
    if (!status) {
      filter.status = 'ACTIVE';
    } else if (status !== 'ALL') {
      filter.status = String(status).toUpperCase();
    }

    if (sourceProvider && sourceProvider !== 'all') {
      filter.sourceProvider = String(sourceProvider);
    }
    if (search) {
      const regex = new RegExp(String(search), 'i');
      filter.$or = [{ name: regex }, { externalStudentId: regex }, { whatsappNumber: regex }];
    }
    if (course) filter.course = String(course);
    if (year) filter.year = String(year);
    if (section) filter.section = String(section);

    const students = await Student.find(filter).sort({ externalStudentId: 1 }).lean();
    const studentIds = students.map((s) => s._id);

    const feeAccounts = await FeeAccount.find({
      institutionId,
      studentId: { $in: studentIds }
    }).lean();

    const feeMap = new Map(feeAccounts.map((f) => [f.studentId.toString(), f]));

    const exportRows = students.map((s) => {
      const fee = feeMap.get(s._id.toString());
      return {
        'Roll / Reg No': s.externalStudentId,
        'Student Name': s.name,
        'Father / Guardian Name': s.fatherName || '',
        'Mother Name': s.motherName || '',
        'WhatsApp Number': s.whatsappNumber || '',
        'Course': s.course || '',
        'Department': s.department || '',
        'Academic Year': s.academicYear || '',
        'Year': s.year || '',
        'Section': s.section || '',
        'Total Fee (₹)': fee ? fee.totalAmount : 0,
        'Paid Amount (₹)': fee ? fee.paidAmount : 0,
        'Balance Due (₹)': fee ? fee.balance : 0,
        'Due Date': fee && fee.dueDate ? new Date(fee.dueDate).toISOString().split('T')[0] : '',
        'Payment Status': fee ? fee.status : 'PENDING',
        'WhatsApp Verification': s.validationStatus || 'VALID',
        'Data Source': s.sourceProvider || 'native_sheet',
        'Source Sheet / Ref': s.sourceSheetId || 'AlphaSheet',
        'Record Status': s.status
      };
    });

    const filteredRows = paymentStatus
      ? exportRows.filter((r) => r['Payment Status'].toUpperCase() === String(paymentStatus).toUpperCase())
      : exportRows;

    const worksheet = XLSX.utils.json_to_sheet(filteredRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students_Roster');

    const fileFormat = String(format).toLowerCase() === 'csv' ? 'csv' : 'xlsx';
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: fileFormat === 'csv' ? 'csv' : 'xlsx'
    });

    const filename = `AlphaSheet_Students_${new Date().toISOString().split('T')[0]}.${fileFormat}`;

    res.setHeader(
      'Content-Type',
      fileFormat === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (error) {
    next(error);
  }
}

export async function downloadImportTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { format = 'xlsx' } = req.query;

    const sampleRows = [
      {
        'Roll No': '24BCS101',
        'Student Name': 'Santhosh Ravi',
        'Father Name': 'Ravi M',
        'Mother Name': 'Lakshmi R',
        'WhatsApp Number': '9876543210',
        'Course': 'B.Tech',
        'Department': 'Computer Science (CSE)',
        'Year': '1',
        'Section': 'A',
        'Total Fee': 75000,
        'Paid Amount': 0,
        'Due Date': '2026-10-15'
      },
      {
        'Roll No': '24BCS102',
        'Student Name': 'Ananya Sharma',
        'Father Name': 'Sharma V',
        'Mother Name': 'Geetha S',
        'WhatsApp Number': '+919123456780',
        'Course': 'B.Tech',
        'Department': 'Information Technology (IT)',
        'Year': '1',
        'Section': 'B',
        'Total Fee': 75000,
        'Paid Amount': 25000,
        'Due Date': '2026-10-15'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students_Template');

    const fileFormat = String(format).toLowerCase() === 'csv' ? 'csv' : 'xlsx';
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: fileFormat === 'csv' ? 'csv' : 'xlsx'
    });

    const filename = `AlphaSheet_Import_Template.${fileFormat}`;
    res.setHeader(
      'Content-Type',
      fileFormat === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
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
          sourceSheetId: student.sourceSheetId || 'AlphaSheet',
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

