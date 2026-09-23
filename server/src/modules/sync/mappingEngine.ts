export interface CanonicalField {
  key: string;
  label: string;
  critical: boolean;
  synonyms: string[];
}

export const CANONICAL_FIELDS: CanonicalField[] = [
  {
    key: 'externalStudentId',
    label: 'Register / Student ID',
    critical: true,
    synonyms: ['register number', 'register no', 'reg no', 'regno', 'roll no', 'rollno', 'student id', 'admission no', 'enrollment no', 'register', 'reg number', 'registration number', 'id']
  },
  {
    key: 'name',
    label: 'Student Name',
    critical: true,
    synonyms: ['student name', 'name', 'full name', 'candidate name', 'student', 'candidate']
  },
  {
    key: 'fatherName',
    label: 'Father / Parent Name',
    critical: false,
    synonyms: ['parent name', 'father name', 'father', 'guardian name', 'parent', 'guardian', 'mother name', 'mother']
  },
  {
    key: 'whatsappNumber',
    label: 'WhatsApp Mobile Number',
    critical: true,
    synonyms: ['whatsapp number', 'parent mobile', 'whatsapp no', 'whatsapp', 'mobile number', 'mobile', 'phone', 'contact number', 'phone number', 'contact']
  },
  {
    key: 'course',
    label: 'Course / Degree',
    critical: false,
    synonyms: ['course', 'programme', 'degree', 'branch', 'class']
  },
  {
    key: 'department',
    label: 'Department',
    critical: false,
    synonyms: ['department', 'dept', 'school']
  },
  {
    key: 'year',
    label: 'Year',
    critical: false,
    synonyms: ['year', 'grade', 'academic year', 'yr']
  },
  {
    key: 'section',
    label: 'Section',
    critical: false,
    synonyms: ['section', 'sec', 'batch']
  },
  {
    key: 'totalFee',
    label: 'Total Fee',
    critical: true,
    synonyms: ['total fee', 'fee amount', 'total', 'fees', 'tuition fee', 'fee due', 'prescribed fee']
  },
  {
    key: 'paidAmount',
    label: 'Paid Amount',
    critical: false,
    synonyms: ['paid amount', 'paid', 'amount paid', 'fee paid', 'collected']
  },
  {
    key: 'dueDate',
    label: 'Due Date',
    critical: true,
    synonyms: ['due date', 'fee due date', 'payment due date', 'last date', 'deadline', 'fine date']
  },
  {
    key: 'fineAmount',
    label: 'Fine Amount',
    critical: false,
    synonyms: ['fine amount', 'fine', 'late fee', 'penalty']
  }
];

export function suggestMapping(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const col of columns) {
    const cleanCol = col.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    
    // Pass 1: Exact key or exact synonym match
    let found = false;
    for (const field of CANONICAL_FIELDS) {
      if (cleanCol === field.key.toLowerCase() || field.synonyms.includes(cleanCol)) {
        mapping[col] = field.key;
        found = true;
        break;
      }
    }
    if (found) continue;

    // Pass 2: Substring match preferring longest synonym
    let bestMatchField: string | null = null;
    let longestLength = 0;

    for (const field of CANONICAL_FIELDS) {
      for (const synonym of field.synonyms) {
        if (cleanCol.includes(synonym) && synonym.length > longestLength) {
          longestLength = synonym.length;
          bestMatchField = field.key;
        }
      }
    }

    if (bestMatchField) {
      mapping[col] = bestMatchField;
    }
  }

  return mapping;
}

export function validateCriticalMappings(mapping: Record<string, string>): { valid: boolean; missing: string[] } {
  const mappedTargets = new Set(Object.values(mapping));
  const criticalFields = CANONICAL_FIELDS.filter((f) => f.critical);
  const missing = criticalFields.filter((f) => !mappedTargets.has(f.key)).map((f) => f.label);

  return {
    valid: missing.length === 0,
    missing
  };
}

export function applyMapping(rawRow: Record<string, any>, mapping: Record<string, string>): Record<string, any> {
  const mapped: Record<string, any> = {};

  // Create lookup for rawRow keys (normalized)
  const normalizedRawKeys = new Map<string, string>();
  for (const k of Object.keys(rawRow)) {
    normalizedRawKeys.set(k.toLowerCase().replace(/[^a-z0-9]/g, ''), k);
  }

  // 1. Apply configured mapping (exact key or normalized match)
  for (const [sourceHeader, canonicalTarget] of Object.entries(mapping)) {
    if (rawRow[sourceHeader] !== undefined) {
      mapped[canonicalTarget] = rawRow[sourceHeader];
    } else {
      const normSource = sourceHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
      const rawKey = normalizedRawKeys.get(normSource);
      if (rawKey && rawRow[rawKey] !== undefined) {
        mapped[canonicalTarget] = rawRow[rawKey];
      }
    }
  }

  // 2. Fallback auto-detection for any unmapped canonical fields directly from rawRow headers
  for (const field of CANONICAL_FIELDS) {
    if (mapped[field.key] === undefined || mapped[field.key] === '') {
      for (const rawHeader of Object.keys(rawRow)) {
        const cleanHeader = rawHeader.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
        if (
          cleanHeader === field.key.toLowerCase() ||
          field.synonyms.includes(cleanHeader) ||
          field.synonyms.some((s) => cleanHeader.includes(s))
        ) {
          if (rawRow[rawHeader] !== undefined && rawRow[rawHeader] !== '') {
            mapped[field.key] = rawRow[rawHeader];
            break;
          }
        }
      }
    }
  }

  return mapped;
}
