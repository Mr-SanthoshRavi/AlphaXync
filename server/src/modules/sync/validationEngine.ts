import { ValidationStatus } from '../../models/Student';

export interface ValidationResult {
  status: ValidationStatus;
  normalizedPhone?: string;
  issues: string[];
}

/**
 * Normalizes phone numbers to standard E.164 format.
 * Defaults to defaultCountryCode (e.g. +91 for India) if 10 digits provided.
 */
export function normalizePhoneNumber(rawPhone: unknown, defaultCountryCode = '+91'): string | null {
  if (!rawPhone || typeof rawPhone !== 'string' && typeof rawPhone !== 'number') {
    return null;
  }

  const str = String(rawPhone).trim();
  // Strip spaces, dashes, brackets
  let cleaned = str.replace(/[\s\-\(\)]/g, '');

  // Strip leading 0091 or 091 if present
  if (cleaned.startsWith('0091') && cleaned.length >= 14) {
    cleaned = `+91${cleaned.slice(4)}`;
  } else if (cleaned.startsWith('091') && cleaned.length === 13) {
    cleaned = `+91${cleaned.slice(3)}`;
  }

  // If already starts with +
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (/^\d{10,15}$/.test(digits)) {
      return cleaned;
    }
    return null;
  }

  // If 10 digits (standard Indian mobile number 6-9 leading)
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `${defaultCountryCode}${cleaned}`;
  }

  // If 12 digits starting with 91 (e.g. 919876543210)
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // If 11 digits starting with 0 (e.g. 09876543210)
  if (/^0[6-9]\d{9}$/.test(cleaned)) {
    return `${defaultCountryCode}${cleaned.slice(1)}`;
  }

  return null;
}

export function parseFlexibleDate(rawDate: unknown): Date | null {
  if (!rawDate) return null;
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) return rawDate;
  const str = String(rawDate).trim();
  if (!str) return null;

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const standard = new Date(str);
  if (!isNaN(standard.getTime())) return standard;
  return null;
}

export function validateStudentRow(mappedData: Record<string, any>, defaultCountryCode = '+91'): ValidationResult {
  const issues: string[] = [];

  // Required Student Identity
  if (!mappedData.externalStudentId || String(mappedData.externalStudentId).trim() === '') {
    issues.push('Missing Student ID / Register Number');
  }

  // Required Name
  if (!mappedData.name || String(mappedData.name).trim() === '') {
    issues.push('Missing Student Name');
  }

  // Phone Validation
  let normalizedPhone: string | null = null;
  if (!mappedData.whatsappNumber || String(mappedData.whatsappNumber).trim() === '') {
    issues.push('Missing WhatsApp Mobile Number');
  } else {
    normalizedPhone = normalizePhoneNumber(mappedData.whatsappNumber, defaultCountryCode);
    if (!normalizedPhone) {
      issues.push(`Invalid WhatsApp Mobile Number format: "${mappedData.whatsappNumber}"`);
    }
  }

  // Financial Number validation
  if (mappedData.totalFee !== undefined && mappedData.totalFee !== null && mappedData.totalFee !== '') {
    const feeNum = Number(mappedData.totalFee);
    if (isNaN(feeNum) || feeNum < 0) {
      issues.push(`Invalid Total Fee amount: "${mappedData.totalFee}"`);
    }
  }

  // Date validation
  if (mappedData.dueDate) {
    const d = parseFlexibleDate(mappedData.dueDate);
    if (!d || isNaN(d.getTime())) {
      issues.push(`Invalid Due Date format: "${mappedData.dueDate}"`);
    }
  }

  if (issues.length > 0) {
    // If phone is missing/invalid or ID missing, mark INVALID
    const isCritical = issues.some(
      (i) => i.includes('Missing Student ID') || i.includes('Missing Student Name') || i.includes('Mobile Number')
    );
    return {
      status: isCritical ? 'INVALID' : 'WARNING',
      normalizedPhone: normalizedPhone || undefined,
      issues
    };
  }

  return {
    status: 'VALID',
    normalizedPhone: normalizedPhone || undefined,
    issues: []
  };
}
