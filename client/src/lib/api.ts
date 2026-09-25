/**
 * AlphaXync API Client
 * Typed fetch client connecting to Express REST endpoints with credential handling.
 */

const rawApiUrl = ((import.meta as any).env?.VITE_API_URL || '').trim();
export const API_BASE = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl.replace(/\/+$/, '')}/api`)
  : '/api';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem('alphaxync_jwt_token');
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem('alphaxync_jwt_token', token);
    } else {
      localStorage.removeItem('alphaxync_jwt_token');
    }
  } catch {}
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: {
    code: string;
    message: string;
    details?: any[];
  };
}

export class ApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // sends and receives httpOnly cookies
  });

  let json: any;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok || (json && json.success === false)) {
    const errorMsg = json?.error?.message || response.statusText || 'API request failed';
    const errorCode = json?.error?.code;
    throw new ApiError(errorMsg, response.status, errorCode);
  }

  return json?.data as T;
}

export const api = {
  // Auth & OTP Verification
  getSetupStatus: () => request<{ setupRequired: boolean }>('/auth/setup-status'),
  initialSetup: (data: {
    institutionName: string;
    institutionCode: string;
    adminName: string;
    email: string;
    password: string;
  }) => request<any>('/auth/setup', { method: 'POST', body: JSON.stringify(data) }),
  sendSetupOtp: (data: {
    institutionName: string;
    institutionCode: string;
    adminName: string;
    email: string;
    password: string;
  }) => request<any>('/auth/setup/send-otp', { method: 'POST', body: JSON.stringify(data) }),
  verifySetupOtp: (email: string, otp: string) =>
    request<any>('/auth/setup/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) }),
  resendSetupOtp: (email: string) =>
    request<any>('/auth/setup/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  getMe: () => request<any>('/auth/me'),
  getCaptchaChallenge: () =>
    request<{
      challengeId: string;
      targetCategory: string;
      targetLabel: string;
      prompt: string;
      targetIconSvg: string;
      tiles: Array<{ id: number; category: string; svg: string }>;
      challengeToken: string;
    }>('/auth/captcha/challenge'),
  verifyCaptcha: (challengeToken: string, selectedIndices: number[]) =>
    request<{ verified: boolean; captchaToken: string }>('/auth/captcha/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeToken, selectedIndices })
    }),
  login: async (email: string, password: string, captchaToken?: string) => {
    const res = await request<any>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, captchaToken }) });
    if (res?.token) setStoredToken(res.token);
    return res;
  },
  verifyLoginOtp: async (email: string, otp: string) => {
    const res = await request<any>('/auth/verify-login-otp', { method: 'POST', body: JSON.stringify({ email, otp }) });
    if (res?.token) setStoredToken(res.token);
    return res;
  },
  logout: async () => {
    try {
      await request<any>('/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },
  getGoogleLoginUrl: () => request<{ authUrl: string; redirectUri: string }>('/auth/google/url'),

  // Password Reset Flow
  sendForgotPasswordOtp: (email: string) =>
    request<{ message: string; email: string }>('/auth/forgot-password/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),
  resetPassword: (data: { email: string; otp: string; newPassword: string }) =>
    request<{ message: string }>('/auth/forgot-password/reset', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Staff Account Management (ADMIN-ONLY)
  getStaffUsers: () => request<{ users: any[] }>('/auth/staff'),
  createStaffUser: (data: {
    name: string;
    email: string;
    password: string;
    role: 'STAFF' | 'CASHIER';
    accessSchedule?: {
      mode: 'ALWAYS' | 'SHIFT_WINDOW' | 'EXPIRING';
      shiftStart?: string;
      shiftEnd?: string;
      expiresAt?: string | null;
    };
    permissions?: string[];
  }) => request<any>('/auth/staff', { method: 'POST', body: JSON.stringify(data) }),
  updateStaffUser: (
    id: string,
    data: {
      name?: string;
      role?: 'STAFF' | 'CASHIER' | 'ADMIN';
      isActive?: boolean;
      accessSchedule?: {
        mode: 'ALWAYS' | 'SHIFT_WINDOW' | 'EXPIRING';
        shiftStart?: string;
        shiftEnd?: string;
        expiresAt?: string | null;
      };
      permissions?: string[];
      password?: string;
    }
  ) => request<any>(`/auth/staff/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteStaffUser: (id: string) => request<any>(`/auth/staff/${id}`, { method: 'DELETE' }),

  // Audit Logs & Activity Trail (ADMIN-ONLY)
  getAuditLogs: (params?: {
    page?: number;
    limit?: number;
    role?: string;
    action?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.role) query.set('role', params.role);
    if (params?.action) query.set('action', params.action);
    if (params?.search) query.set('search', params.search);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    return request<{
      logs: any[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
      stats: { todayCount: number; staffCountToday: number; adminCountToday: number; paymentActionsToday: number };
    }>(`/audit-logs?${query.toString()}`);
  },

  // Dashboard
  getDashboardSummary: (academicYear?: string) =>
    request<any>(`/dashboard/summary${academicYear ? `?academicYear=${academicYear}` : ''}`),

  // Students
  getStudents: (params: {
    search?: string;
    course?: string;
    year?: string;
    section?: string;
    paymentStatus?: string;
    whatsappStatus?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.course) query.set('course', params.course);
    if (params.year) query.set('year', params.year);
    if (params.section) query.set('section', params.section);
    if (params.paymentStatus) query.set('paymentStatus', params.paymentStatus);
    if (params.whatsappStatus) query.set('whatsappStatus', params.whatsappStatus);
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());
    return request<{ students: any[]; pagination: { total: number; page: number; limit: number; pages: number } }>(
      `/students?${query.toString()}`
    );
  },
  getStudentDetail: (id: string) => request<any>(`/students/${id}`),

  // Fees & Payments
  getFees: (params?: { search?: string; status?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    return request<{ fees: any[]; pagination: { total: number; page: number; limit: number; pages: number } }>(
      `/fees?${query.toString()}`
    );
  },
  getFeeDetail: (id: string) => request<any>(`/fees/${id}`),
  getFeeCategories: () => request<any>('/fees/categories'),
  setFeeStructure: (data: { mode: string; assignments: Array<{ category: string; amount: number }> }) =>
    request<any>('/fees/set-fee-structure', { method: 'POST', body: JSON.stringify(data) }),
    
  // Dynamic Fee Rules
  discoverDimensions: () => request<any>('/fees/discover-dimensions'),
  previewRuleMatch: (criteria: any[]) => request<any>('/fees/preview-rule-match', { method: 'POST', body: JSON.stringify({ criteria }) }),
  getFeeRules: () => request<any>('/fees/rules'),
  createFeeRule: (data: any) => request<any>('/fees/rules', { method: 'POST', body: JSON.stringify(data) }),
  deleteFeeRule: (id: string) => request<any>(`/fees/rules/${id}`, { method: 'DELETE' }),
  recordOfflinePayment: (data: {
    studentId: string;
    feeAccountId: string;
    amount: number;
    method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'OFFLINE' | 'UPI';
    reference?: string;
    note?: string;
  }) => request<any>('/payments/offline', { method: 'POST', body: JSON.stringify(data) }),
  aiReconcilePayment: (data: {
    studentId: string;
    amount: number;
    method: string;
    reference?: string;
    notes?: string;
  }) => request<any>('/payments/ai-reconcile', { method: 'POST', body: JSON.stringify(data) }),
  createPaymentRequest: (data: { studentId: string; feeAccountId: string; amount?: number; sendWhatsApp?: boolean }) =>
    request<any>('/payments/request', { method: 'POST', body: JSON.stringify(data) }),
  adjustFee: (data: { feeAccountId: string; newTotalAmount: number; reason: string }) =>
    request<any>('/payments/adjust-fee', { method: 'POST', body: JSON.stringify(data) }),
  waiveFine: (data: { feeAccountId: string; reason: string }) =>
    request<any>('/payments/waive-fine', { method: 'POST', body: JSON.stringify(data) }),
  changeDueDate: (data: { feeAccountId: string; newDueDate: string; reason: string }) =>
    request<any>('/payments/change-due-date', { method: 'POST', body: JSON.stringify(data) }),

  // Automations
  getAutomations: () => request<any[]>('/automations'),
  getAutomationVariables: () => request<{ variables: Array<{ tag: string; label: string; sample: string; category: string }>; totalDiscovered: number; googleSheetColumns: string[] }>('/automations/variables'),
  getAutomationFilterOptions: () =>
    request<{ columns: Array<{ key: string; label: string; values: string[] }>; totalActiveContacts: number }>(
      '/automations/filter-options'
    ),
  getAutomationMatchingCount: (data: { target: string; criteria?: any[]; feeStatus?: string }) =>
    request<{ matchingCount: number; totalEligible: number; sampleRecipients: string[] }>(
      '/automations/matching-count',
      { method: 'POST', body: JSON.stringify(data) }
    ),
  aiPolishAutomationTemplate: (draft: string) =>
    request<{ polished: string; corrections: string[]; summary: string }>(
      '/automations/ai-polish',
      { method: 'POST', body: JSON.stringify({ draft }) }
    ),
  uploadAutomationMedia: (filename: string, base64: string) =>
    request<{ mediaUrl: string; filename: string; size: number }>('/automations/upload-media', {
      method: 'POST',
      body: JSON.stringify({ filename, base64 })
    }),
  createCustomAutomation: (data: {
    name: string;
    description?: string;
    template: string;
    audience?: any;
    schedule?: any;
    enabled?: boolean;
  }) => request<any>('/automations/custom', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomAutomation: (id: string, data: any) =>
    request<any>(`/automations/custom/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomAutomation: (id: string) =>
    request<any>(`/automations/custom/${id}`, { method: 'DELETE' }),
  triggerSingleAutomation: (id: string) =>
    request<any>(`/automations/${id}/trigger-single`, { method: 'POST' }),
  toggleAutomation: (type: string, enabled: boolean) =>
    request<any>(`/automations/${type}/toggle`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  updateAutomation: (type: string, data: any) =>
    request<any>(`/automations/${type}`, { method: 'PUT', body: JSON.stringify(data) }),
  previewAutomation: (template: string, studentId?: string) =>
    request<any>('/automations/preview', { method: 'POST', body: JSON.stringify({ template, studentId }) }),
  pauseAutomations: () => request<any>('/automations/pause', { method: 'POST' }),
  resumeAutomations: () => request<any>('/automations/resume', { method: 'POST' }),
  updatePacingConfig: (minSendIntervalMs: number) =>
    request<any>('/automations/pacing', { method: 'POST', body: JSON.stringify({ minSendIntervalMs }) }),
  getAutomationSummary: () => request<any>('/automations/summary'),
  triggerAutomations: () => request<any>('/automations/trigger', { method: 'POST' }),

  // Messages
  getMessages: (params?: { status?: string; search?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    return request<{ messages: any[]; pagination: { total: number; page: number; limit: number; pages: number } }>(
      `/messages?${query.toString()}`
    );
  },
  getMessageStats: () => request<any>('/messages/stats'),
  sendTestMessage: (recipient: string, messageText?: string) =>
    request<any>('/messages/test-send', { method: 'POST', body: JSON.stringify({ recipient, messageText }) }),
  getMessageDetail: (id: string) => request<any>(`/messages/${id}`),
  retryMessage: (id: string) => request<any>(`/messages/${id}/retry`, { method: 'POST' }),

  // Sync
  triggerSync: () => request<any>('/sync/trigger', { method: 'POST' }),
  getSyncStatus: () => request<any>('/sync/status'),
  getSyncConflicts: () => request<any[]>('/sync/conflicts'),
  resolveSyncConflict: (conflictId: string, data: { resolution: 'KEEP_VERIFIED_VALUE' | 'ACCEPT_SOURCE_CHANGE'; notes?: string }) =>
    request<any>(`/sync/conflicts/${conflictId}/resolve`, { method: 'POST', body: JSON.stringify(data) }),
  discoverColumns: (sheet?: string) =>
    request<any>(`/sync/discover${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ''}`),
  saveColumnMapping: (mapping: Record<string, string>) =>
    request<any>('/sync/mapping', { method: 'POST', body: JSON.stringify({ mapping }) }),

  // Google Connection & Spreadsheets
  getGoogleAuthUrl: () => request<{ authUrl: string; redirectUri: string }>('/connections/google/auth-url'),
  getGoogleSpreadsheets: () =>
    request<{ spreadsheets: Array<{ id: string; name: string; modifiedTime: string; webViewLink?: string }>; currentSpreadsheetId?: string; currentSheetName?: string }>(
      '/connections/google/spreadsheets'
    ),
  selectGoogleSpreadsheet: (data: { spreadsheetId: string; sheetReference?: string }) =>
    request<{ spreadsheetId: string; spreadsheetTitle: string; activeTab: string; tabs: Array<{ sheetId: number; title: string }> }>(
      '/connections/google/select-spreadsheet',
      { method: 'POST', body: JSON.stringify(data) }
    ),
  getGoogleTabs: () =>
    request<{ spreadsheetId: string; spreadsheetTitle: string; activeTab: string; tabs: Array<{ sheetId: number; title: string }> }>(
      '/connections/google/tabs'
    ),
  selectGoogleTabs: (data: { studentMasterSheet: string; announcementsSheet?: string; staffSheet?: string }) =>
    request<any>('/connections/google/select-tabs', { method: 'POST', body: JSON.stringify(data) }),
  disconnectGoogle: () => request<any>('/connections/google/disconnect', { method: 'POST' }),

  // WhatsApp Baileys Connection
  getWhatsAppConnectionStatus: () =>
    request<{
      provider: string;
      state: 'NOT_CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'QR_REQUIRED' | 'CONNECTED' | 'RECONNECTING' | 'AUTHENTICATING' | 'AUTH_REQUIRED' | 'LOGGED_OUT' | 'ERROR';
      statusText: string;
      qrCode: string | null;
      maskedPhone: string | null;
      lastError: string | null;
      hasStoredSession: boolean;
      minSendIntervalMs?: number;
      concurrency?: number;
    }>('/connections/whatsapp/status'),
  connectWhatsApp: () => request<{ state: string; message: string }>('/connections/whatsapp/connect', { method: 'POST' }),
  refreshWhatsAppQr: () => request<{ state: string; qrCode: string | null; message: string }>('/connections/whatsapp/refresh-qr', { method: 'POST' }),
  disconnectWhatsApp: () => request<{ state: string; message: string }>('/connections/whatsapp/disconnect', { method: 'POST' }),
  logoutWhatsApp: () => request<{ state: string; message: string }>('/connections/whatsapp/logout', { method: 'POST' }),

  // Settings
  getSettings: () => request<any>('/settings'),
  updateInstitutionSettings: (data: { name?: string; timezone?: string; logoUrl?: string; receiptSettings?: any }) =>
    request<any>('/settings/institution', { method: 'PUT', body: JSON.stringify(data) }),

  // Public Pay
  getPublicPaymentIntent: (token: string) => request<any>(`/public/pay/${token}`),
  createPublicOrder: (token: string) => request<any>(`/public/pay/${token}/order`, { method: 'POST' }),
  verifyPublicPayment: (token: string, data: { razorpayOrderId?: string; razorpayPaymentId?: string; razorpaySignature?: string; razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string }) =>
    request<any>(`/public/pay/${token}/verify`, { method: 'POST', body: JSON.stringify(data) }),

  // Chatbot Copilot
  askChatbot: (query: string, history?: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    request<{ reply: string; isSecurityRefusal?: boolean; timestamp?: string }>('/chatbot/ask', {
      method: 'POST',
      body: JSON.stringify({ query, history })
    })
};
