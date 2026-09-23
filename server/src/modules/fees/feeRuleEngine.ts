import { Types } from 'mongoose';
import { FeeRule, IFeeRule } from '../../models/FeeRule';
import { Student, IStudent } from '../../models/Student';
import { FeeAccount } from '../../models/FeeAccount';
import { Job } from '../../models/Job';
import { logger } from '../../utils/logger';

function normalizeValue(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Convert Roman numerals to Arabic numbers and vice versa for robust Year comparisons
function getYearEquivalents(val: string): string[] {
  const norm = normalizeValue(val);
  const romanMap: Record<string, string[]> = {
    'i': ['i', '1', '1st', 'first'],
    '1': ['i', '1', '1st', 'first'],
    '1st': ['i', '1', '1st', 'first'],
    'first': ['i', '1', '1st', 'first'],
    'ii': ['ii', '2', '2nd', 'second'],
    '2': ['ii', '2', '2nd', 'second'],
    '2nd': ['ii', '2', '2nd', 'second'],
    'second': ['ii', '2', '2nd', 'second'],
    'iii': ['iii', '3', '3rd', 'third'],
    '3': ['iii', '3', '3rd', 'third'],
    '3rd': ['iii', '3', '3rd', 'third'],
    'third': ['iii', '3', '3rd', 'third'],
    'iv': ['iv', '4', '4th', 'fourth'],
    '4': ['iv', '4', '4th', 'fourth'],
    '4th': ['iv', '4', '4th', 'fourth'],
    'fourth': ['iv', '4', '4th', 'fourth']
  };
  return romanMap[norm] || [norm];
}

export async function findMatchingStudents(institutionId: Types.ObjectId, criteria: { field: string; value: string }[]): Promise<IStudent[]> {
  const allStudents = await Student.find({ institutionId, status: 'ACTIVE' });
  
  if (!criteria || criteria.length === 0) {
    return allStudents;
  }
  
  return allStudents.filter(student => {
    return criteria.every(c => {
      const targetField = normalizeValue(c.field);
      const targetVal = normalizeValue(c.value);
      const yearEquivs = targetField.includes('year') ? getYearEquivalents(c.value) : null;
      
      // 1. Check direct standard fields on Student document
      let directVal = '';
      if (targetField === 'course' || targetField.includes('course')) directVal = normalizeValue(student.course);
      else if (targetField === 'department' || targetField.includes('department') || targetField.includes('dept')) directVal = normalizeValue(student.department);
      else if (targetField === 'year' || targetField.includes('year')) directVal = normalizeValue(student.year);
      else if (targetField === 'section' || targetField.includes('section') || targetField.includes('sec')) directVal = normalizeValue(student.section);
      
      if (directVal) {
        if (yearEquivs) {
          if (yearEquivs.includes(directVal)) return true;
        } else if (directVal === targetVal) {
          return true;
        }
      }
      
      // 2. Check rawSourceData flexibly (case-insensitive and space-normalized key & value)
      if (student.rawSourceData) {
        for (const [rawKey, rawVal] of Object.entries(student.rawSourceData)) {
          const normKey = normalizeValue(rawKey);
          if (normKey === targetField) {
            const normRawVal = normalizeValue(rawVal);
            if (yearEquivs) {
              if (yearEquivs.includes(normRawVal)) return true;
            } else if (normRawVal === targetVal) {
              return true;
            }
          }
        }
      }
      
      return false;
    });
  });
}

export async function applyFeeRule(rule: IFeeRule, students: IStudent[]): Promise<number> {
  if (!students || students.length === 0) return 0;
  
  const studentIds = students.map(s => s._id);
  const feeAccounts = await FeeAccount.find({
    institutionId: rule.institutionId,
    studentId: { $in: studentIds },
    academicYear: rule.academicYear,
    feeType: rule.feeType
  });

  let updatedCount = 0;
  const sheetUpdatePromises: Promise<any>[] = [];

  for (const fa of feeAccounts) {
    if (fa.totalAmount === rule.amount && fa.dueDate.getTime() === rule.dueDate.getTime() && fa.fineAmount === rule.fineAmount) {
      continue; // No changes needed
    }

    fa.totalAmount = rule.amount;
    fa.dueDate = rule.dueDate;
    if (rule.fineDate) fa.fineDate = rule.fineDate;
    fa.fineAmount = rule.fineAmount;
    
    fa.balance = Math.max(0, rule.amount - fa.paidAmount);
    fa.status = fa.balance === 0 ? 'PAID' : fa.paidAmount > 0 ? 'PARTIAL' : 'PENDING';
    
    await fa.save();
    updatedCount++;

    const student = students.find(s => s._id.toString() === fa.studentId.toString());
    if (student) {
      if (student.rawSourceData) {
        student.rawSourceData['Total Fee'] = String(rule.amount);
        student.markModified('rawSourceData');
        await student.save();
      }
      if (student.sourceRowReference) {
        sheetUpdatePromises.push(
          Job.create({
            type: 'SHEET_WRITE_BACK',
            payload: {
              institutionId: rule.institutionId.toString(),
              studentId: fa.studentId.toString(),
              receiptNumber: '',
              paidAmount: fa.paidAmount,
              balance: fa.balance,
              status: fa.status,
              totalFee: rule.amount,
              writeBackFields: { 'Total Fee': rule.amount, 'Balance': fa.balance, 'Payment Status': fa.status }
            },
            status: 'QUEUED'
          })
        );
      }
    }
  }

  // Also create missing fee accounts
  const existingStudentIds = new Set(feeAccounts.map(fa => fa.studentId.toString()));
  const missingStudents = students.filter(s => !existingStudentIds.has(s._id.toString()));

  for (const student of missingStudents) {
    const fa = await FeeAccount.create({
      institutionId: rule.institutionId,
      studentId: student._id,
      academicYear: rule.academicYear,
      feeType: rule.feeType,
      totalAmount: rule.amount,
      paidAmount: 0,
      balance: rule.amount,
      dueDate: rule.dueDate,
      fineDate: rule.fineDate,
      fineAmount: rule.fineAmount,
      status: rule.amount === 0 ? 'PAID' : 'PENDING'
    });
    updatedCount++;
    
    if (student.sourceRowReference) {
      sheetUpdatePromises.push(
        Job.create({
          type: 'SHEET_WRITE_BACK',
          payload: {
            institutionId: rule.institutionId.toString(),
            studentId: fa.studentId.toString(),
            receiptNumber: '',
            paidAmount: fa.paidAmount,
            balance: fa.balance,
            status: fa.status,
            totalFee: rule.amount,
            writeBackFields: { 'Total Fee': rule.amount, 'Balance': fa.balance, 'Payment Status': fa.status }
          },
          status: 'QUEUED'
        })
      );
    }
  }

  await Promise.all(sheetUpdatePromises);
  
  if (sheetUpdatePromises.length > 0) {
    try {
      const { processSheetWriteBackBatch } = await import('./feeController');
      processSheetWriteBackBatch(rule.institutionId).catch(err => {
        logger.error('FEE_RULE_ENGINE', `Background sheet write-back failed: ${err.message}`);
      });
    } catch (e) {
      logger.error('FEE_RULE_ENGINE', `Error triggering sheet writeback worker: ${(e as any).message}`);
    }
  }

  return updatedCount;
}

export async function applyAllActiveRules(institutionId: Types.ObjectId) {
  const rules = await FeeRule.find({ institutionId, isActive: true }).sort({ 'criteria.length': 1, createdAt: 1 });
  
  let totalApplied = 0;
  for (const rule of rules) {
    try {
      const matchingStudents = await findMatchingStudents(institutionId, rule.criteria);
      const updatedCount = await applyFeeRule(rule, matchingStudents);
      
      if (rule.appliedCount !== matchingStudents.length) {
        rule.appliedCount = matchingStudents.length;
        await rule.save();
      }
      
      totalApplied += updatedCount;
    } catch (err: any) {
      logger.error('FEE_RULE_ENGINE', `Error applying rule ${rule.name}: ${err.message}`);
    }
  }
  
  return totalApplied;
}
