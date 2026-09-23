export type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  event: string;
  message?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

const REDACTED_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'credentials',
  'key',
  'razorpayKeySecret',
  'webhookSecret',
  'encryptionKey'
]);

function sanitize(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(k.toLowerCase()) || k.toLowerCase().includes('secret') || k.toLowerCase().includes('token')) {
      sanitized[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = sanitize(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

function writeLog(level: LogLevel, event: string, message?: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    event,
    message,
    data: data ? (sanitize(data) as Record<string, unknown>) : undefined,
    timestamp: new Date().toISOString()
  };

  const output = JSON.stringify(entry);
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  info: (event: string, message?: string, data?: Record<string, unknown>) => writeLog('info', event, message, data),
  warn: (event: string, message?: string, data?: Record<string, unknown>) => writeLog('warn', event, message, data),
  error: (event: string, message?: string, data?: Record<string, unknown>) => writeLog('error', event, message, data)
};
