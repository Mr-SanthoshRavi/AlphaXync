export class TemplateRenderError extends Error {
  public missingVariables: string[];
  constructor(missingVariables: string[]) {
    super(`TEMPLATE_RENDER_ERROR: Unresolved or missing variables: ${missingVariables.join(', ')}`);
    this.name = 'TEMPLATE_RENDER_ERROR';
    this.missingVariables = missingVariables;
  }
}

export interface RenderTemplateOptions {
  template: string;
  data: Record<string, string | number | undefined | null>;
  strict?: boolean;
}

export const SUPPORTED_VARIABLES = [
  'student_name',
  'father_name',
  'college_name',
  'course',
  'year',
  'fee_amount',
  'paid_amount',
  'balance',
  'due_date',
  'fine_amount',
  'receipt_number',
  'transaction_id',
  'payment_link',
  'announcement_title',
  'announcement_message',
  'staff_name',
  'department',
  'salary_date',
  'increment_date',
  'ticket_id',
  'subject'
];

/**
 * Validates whether all {{variables}} in a template have matching non-nullish data keys.
 */
export function validateTemplate(
  template: string,
  data: Record<string, any>
): { valid: boolean; missingVariables: string[]; rendered?: string } {
  const extracted = extractTemplateVariables(template);
  const missingVariables: string[] = [];

  for (const varName of extracted) {
    if (data[varName] === undefined || data[varName] === null || data[varName] === '') {
      missingVariables.push(varName);
    }
  }

  if (missingVariables.length > 0) {
    return { valid: false, missingVariables };
  }

  try {
    const rendered = renderTemplate(template, data, false);
    return { valid: true, missingVariables: [], rendered };
  } catch (err: any) {
    return { valid: false, missingVariables: [err.message] };
  }
}

/**
 * Renders template with variable substitution.
 * In strict mode (default true), throws TemplateRenderError if any {{token}} remains unresolved.
 */
export function renderTemplate(template: string, data: Record<string, any>, strict = true): string {
  let output = template;

  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && val !== null) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      output = output.replace(regex, String(val));
    }
  }

  // Check for any remaining unreplaced tokens
  const unreplacedMatches = output.match(/{{([a-zA-Z0-9_]+)}}/g);
  if (unreplacedMatches && unreplacedMatches.length > 0) {
    const missing = [...new Set(unreplacedMatches.map((m) => m.replace(/^{{|}}$/g, '')))];
    if (strict) {
      throw new TemplateRenderError(missing);
    }
  }

  return output.trim();
}

/**
 * Extracts list of variables needed by a template string.
 */
export function extractTemplateVariables(template: string): string[] {
  const matches = template.match(/{{([a-zA-Z0-9_]+)}}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

