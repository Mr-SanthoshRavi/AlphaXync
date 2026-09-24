import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useAuth, type ReceiptSettings } from '../contexts/AuthContext';
import { ReceiptPaper, DEFAULT_RECEIPT_SETTINGS, type ReceiptData } from '../components/ReceiptModal';
import { StaffUserGuide } from '../components/StaffUserGuide';

interface SettingsData {
  institution: {
    id: string;
    name: string;
    code: string;
    timezone: string;
    defaultCountryCode?: string;
    logoUrl?: string;
    receiptSettings?: ReceiptSettings;
  };
  connections: {
    razorpay: {
      connected: boolean;
      mode: string;
      keyIdMasked: string;
      status: string;
    };
    whatsapp: {
      connected: boolean;
      phoneNumberMasked: string;
      status: string;
    };
    googleSheets: {
      connected: boolean;
      status: string;
      source: string;
    };
    ai: {
      enabled: boolean;
      status: string;
    };
  };
}

interface WhatsAppStatusData {
  provider: string;
  state:
    | 'NOT_CONNECTED'
    | 'DISCONNECTED'
    | 'CONNECTING'
    | 'QR_REQUIRED'
    | 'CONNECTED'
    | 'RECONNECTING'
    | 'AUTHENTICATING'
    | 'AUTH_REQUIRED'
    | 'LOGGED_OUT'
    | 'ERROR';
  statusText: string;
  qrCode: string | null;
  maskedPhone: string | null;
  lastError: string | null;
  hasStoredSession: boolean;
  minSendIntervalMs?: number;
  concurrency?: number;
}

const COLOR_PRESETS = [
  { name: 'Charcoal', hex: '#111827' },
  { name: 'Royal Navy', hex: '#1e3a8a' },
  { name: 'Sapphire Blue', hex: '#1e40af' },
  { name: 'Forest Emerald', hex: '#065f46' },
  { name: 'Crimson Red', hex: '#991b1b' },
  { name: 'Slate Gray', hex: '#374151' },
  { name: 'Royal Violet', hex: '#581c87' }
];

const BG_COLOR_PRESETS = [
  { name: 'Pure White', hex: '#ffffff' },
  { name: 'Warm Ivory', hex: '#fdfbf7' },
  { name: 'Soft Ice', hex: '#f8fafc' },
  { name: 'Sage Tint', hex: '#f0fdf4' },
  { name: 'Lavender Mist', hex: '#faf5ff' },
  { name: 'Dark Slate', hex: '#0f172a' }
];

const TEXT_COLOR_PRESETS = [
  { name: 'Charcoal Deep', hex: '#111827' },
  { name: 'Slate Gray', hex: '#374151' },
  { name: 'Navy Midnight', hex: '#1e293b' },
  { name: 'Dark Emerald', hex: '#064e3b' },
  { name: 'Bright White', hex: '#f8fafc' }
];

const DUMMY_RECEIPT: ReceiptData = {
  receiptNumber: 'REC-ST2026-1005',
  studentName: 'Naveen P',
  registerNo: 'ST2026-1005',
  course: 'BSc CS',
  department: 'General',
  amount: 50000,
  paymentMethod: 'OFFLINE / ONLINE',
  transactionReference: 'TXN-CASH-49102',
  date: new Date().toISOString(),
  balanceRemaining: 0,
  notes: 'Tuition Fee Installment'
};

export const SettingsPage: React.FC = () => {
  const { user, setInstitution, refreshAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<'receipt' | 'institution' | 'whatsapp' | 'connections' | 'accounts' | 'audit' | 'guide'>('receipt');
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Accounts & Staff State (Admin-Only)
  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF' as 'STAFF' | 'CASHIER',
    scheduleMode: 'ALWAYS' as 'ALWAYS' | 'SHIFT_WINDOW' | 'EXPIRING',
    shiftStart: '09:00',
    shiftEnd: '18:00',
    expiresAt: '',
    permissions: ['COLLECT_PAYMENTS', 'RECORD_OFFLINE', 'VIEW_STUDENTS']
  });
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [deletingStaffId, setDeletingStaffId] = useState<string | null>(null);

  // Staff Edit Modal State
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [editStaffForm, setEditStaffForm] = useState({
    name: '',
    role: 'STAFF' as 'STAFF' | 'CASHIER' | 'ADMIN',
    isActive: true,
    scheduleMode: 'ALWAYS' as 'ALWAYS' | 'SHIFT_WINDOW' | 'EXPIRING',
    shiftStart: '09:00',
    shiftEnd: '18:00',
    expiresAt: '',
    permissions: ['COLLECT_PAYMENTS', 'RECORD_OFFLINE', 'VIEW_STUDENTS'],
    password: ''
  });
  const [updatingStaff, setUpdatingStaff] = useState(false);

  // Audit Logs & Activity Stream State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditStats, setAuditStats] = useState<any>(null);
  const [auditRole, setAuditRole] = useState('ALL');
  const [auditAction, setAuditAction] = useState('ALL');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTimezone, setEditTimezone] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Receipt Customizer State
  const [receiptForm, setReceiptForm] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);
  const [savingReceipt, setSavingReceipt] = useState(false);

  // WhatsApp Connection State
  const [waStatus, setWaStatus] = useState<WhatsAppStatusData>({
    provider: 'baileys',
    state: 'NOT_CONNECTED',
    statusText: 'NOT CONNECTED',
    qrCode: null,
    maskedPhone: null,
    lastError: null,
    hasStoredSession: false
  });
  const [waLoading, setWaLoading] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const pollTimerRef = useRef<any>(null);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await api.getSettings();
      setSettings(res);
      if (res?.institution) {
        setEditName(res.institution.name || '');
        setEditTimezone(res.institution.timezone || 'Asia/Kolkata');
        setEditLogoUrl(res.institution.logoUrl || '');
        if (res.institution.receiptSettings) {
          setReceiptForm({
            ...DEFAULT_RECEIPT_SETTINGS,
            ...res.institution.receiptSettings
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch settings from API:', err);
      setSettings(null);
    } finally {
      setLoading(false);
    }
  };

  const loadWhatsAppStatus = async () => {
    try {
      const res = await api.getWhatsAppConnectionStatus();
      if (res) {
        setWaStatus(res);
      }
    } catch (err: any) {
      console.error('Failed to fetch WhatsApp status:', err);
    }
  };

  useEffect(() => {
    loadSettings();
    loadWhatsAppStatus();
  }, []);

  // Auto-polling when waiting for QR scan or connection
  useEffect(() => {
    const isWaitingForScan =
      waStatus.state === 'QR_REQUIRED' ||
      waStatus.state === 'AUTH_REQUIRED' ||
      waStatus.state === 'CONNECTING' ||
      waStatus.state === 'AUTHENTICATING';

    if (isWaitingForScan) {
      if (!pollTimerRef.current) {
        pollTimerRef.current = setInterval(() => {
          loadWhatsAppStatus();
        }, 2000);
      }
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [waStatus.state]);

  // WhatsApp Actions
  const handleConnectWhatsApp = async () => {
    try {
      setWaLoading(true);
      setToast('Initiating WhatsApp connection and generating QR...');
      await api.connectWhatsApp();
      await loadWhatsAppStatus();
    } catch (err: any) {
      setToast(`Connection error: ${err.message || 'Failed to start connection'}`);
    } finally {
      setWaLoading(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const handleRefreshQr = async () => {
    try {
      setWaLoading(true);
      setToast('Requesting fresh QR code from WhatsApp Web...');
      await api.refreshWhatsAppQr();
      await loadWhatsAppStatus();
    } catch (err: any) {
      setToast(`Refresh error: ${err.message || 'Failed to refresh QR'}`);
    } finally {
      setWaLoading(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const handleCancelConnect = async () => {
    try {
      setWaLoading(true);
      await api.disconnectWhatsApp();
      await loadWhatsAppStatus();
      setToast('WhatsApp connection cancelled');
    } catch (err: any) {
      console.error(err);
    } finally {
      setWaLoading(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleConfirmDisconnect = async () => {
    try {
      setWaLoading(true);
      setShowDisconnectModal(false);
      setToast('Logging out WhatsApp Web session and stopping automation...');
      await api.logoutWhatsApp();
      await loadWhatsAppStatus();
      await loadSettings();
      setToast('WhatsApp session logged out. Automation paused.');
    } catch (err: any) {
      setToast(`Disconnect error: ${err.message || 'Logout failed'}`);
    } finally {
      setWaLoading(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const loadStaffList = async () => {
    try {
      setStaffLoading(true);
      const res = await api.getStaffUsers();
      setStaffList(res?.users || []);
    } catch (err: any) {
      console.error('Failed to load staff accounts:', err);
    } finally {
      setStaffLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'accounts') {
      loadStaffList();
    } else if (activeTab === 'audit') {
      loadAuditLogs(1);
    }
  }, [activeTab, auditRole, auditAction]);

  const loadAuditLogs = async (page = 1) => {
    try {
      setAuditLoading(true);
      const res = await api.getAuditLogs({
        page,
        limit: 25,
        role: auditRole !== 'ALL' ? auditRole : undefined,
        action: auditAction !== 'ALL' ? auditAction : undefined,
        search: auditSearch.trim() || undefined
      });
      if (res) {
        setAuditLogs(res.logs || []);
        setAuditPagination(res.pagination || { total: 0, page: 1, limit: 25, totalPages: 1 });
        setAuditStats(res.stats || null);
        setAuditPage(page);
      }
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
      setToast('Failed to load audit logs: ' + (err?.message || 'Server error'));
    } finally {
      setAuditLoading(false);
    }
  };

  const handleToggleStaffActive = async (st: any) => {
    try {
      const newActive = !st.isActive;
      await api.updateStaffUser(st.id, { isActive: newActive });
      setToast(`${st.name}'s account is now ${newActive ? 'Active' : 'Suspended'}.`);
      await loadStaffList();
    } catch (err: any) {
      setToast(err?.message || 'Failed to update account status');
      setTimeout(() => setToast(null), 4000);
    }
  };

  const openEditStaffModal = (st: any) => {
    setEditingStaff(st);
    setEditStaffForm({
      name: st.name,
      role: st.role,
      isActive: st.isActive !== false,
      scheduleMode: st.accessSchedule?.mode || 'ALWAYS',
      shiftStart: st.accessSchedule?.shiftStart || '09:00',
      shiftEnd: st.accessSchedule?.shiftEnd || '18:00',
      expiresAt: st.accessSchedule?.expiresAt ? new Date(st.accessSchedule.expiresAt).toISOString().split('T')[0] : '',
      permissions: st.permissions || ['COLLECT_PAYMENTS', 'RECORD_OFFLINE', 'VIEW_STUDENTS'],
      password: ''
    });
  };

  const handleSaveEditStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    try {
      setUpdatingStaff(true);
      await api.updateStaffUser(editingStaff.id, {
        name: editStaffForm.name,
        role: editStaffForm.role,
        isActive: editStaffForm.isActive,
        accessSchedule: {
          mode: editStaffForm.scheduleMode,
          shiftStart: editStaffForm.shiftStart,
          shiftEnd: editStaffForm.shiftEnd,
          expiresAt: editStaffForm.expiresAt ? new Date(editStaffForm.expiresAt).toISOString() : null
        },
        permissions: editStaffForm.permissions,
        password: editStaffForm.password.trim() ? editStaffForm.password.trim() : undefined
      });
      setToast(`Staff account "${editStaffForm.name}" updated successfully.`);
      setEditingStaff(null);
      await loadStaffList();
    } catch (err: any) {
      setToast(err?.message || 'Failed to update staff account');
    } finally {
      setUpdatingStaff(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffForm.name.trim() || !staffForm.email.trim() || !staffForm.password.trim()) {
      setToast('Please fill out all staff fields.');
      return;
    }
    if (staffForm.password.length < 6) {
      setToast('Password must be at least 6 characters long.');
      return;
    }
    try {
      setCreatingStaff(true);
      await api.createStaffUser({
        name: staffForm.name.trim(),
        email: staffForm.email.trim().toLowerCase(),
        password: staffForm.password,
        role: staffForm.role,
        accessSchedule: {
          mode: staffForm.scheduleMode,
          shiftStart: staffForm.shiftStart,
          shiftEnd: staffForm.shiftEnd,
          expiresAt: staffForm.expiresAt ? new Date(staffForm.expiresAt).toISOString() : null
        },
        permissions: staffForm.permissions
      });
      setToast(`Staff account created for ${staffForm.email}! Welcome email dispatched via Resend.`);
      setShowAddStaffModal(false);
      setStaffForm({
        name: '',
        email: '',
        password: '',
        role: 'STAFF',
        scheduleMode: 'ALWAYS',
        shiftStart: '09:00',
        shiftEnd: '18:00',
        expiresAt: '',
        permissions: ['COLLECT_PAYMENTS', 'RECORD_OFFLINE', 'VIEW_STUDENTS']
      });
      await loadStaffList();
    } catch (err: any) {
      setToast(err?.message || 'Failed to create staff member.');
    } finally {
      setCreatingStaff(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleDeleteStaff = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove staff member "${name}"?`)) return;
    try {
      setDeletingStaffId(id);
      await api.deleteStaffUser(id);
      setToast(`Account "${name}" removed successfully.`);
      await loadStaffList();
    } catch (err: any) {
      setToast(err?.message || 'Could not delete staff member.');
    } finally {
      setDeletingStaffId(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setToast('Logo image must be under 2MB.');
      setTimeout(() => setToast(null), 4000);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEditLogoUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleWatermarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setToast('Watermark emblem must be under 2MB.');
      setTimeout(() => setToast(null), 4000);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setReceiptForm((prev) => ({
        ...prev,
        watermarkCustomUrl: reader.result as string
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateInstitutionSettings({
        name: editName,
        timezone: editTimezone,
        logoUrl: editLogoUrl
      });
      const updated = (res as any)?.data || res;
      if (updated) {
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                institution: {
                  ...prev.institution,
                  name: updated.name,
                  timezone: updated.timezone,
                  logoUrl: updated.logoUrl
                }
              }
            : null
        );
        setInstitution(updated);
      }
      setIsEditing(false);
      setToast('Institution profile & official seal updated successfully!');
      await refreshAuth();
      await loadSettings();
    } catch (err: any) {
      setToast(`Failed to update: ${err.message || 'Server error'}`);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const handleSaveReceiptSettings = async () => {
    setSavingReceipt(true);
    try {
      const res = await api.updateInstitutionSettings({
        receiptSettings: receiptForm
      });
      const updated = (res as any)?.data || res;
      if (updated) {
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                institution: {
                  ...prev.institution,
                  receiptSettings: updated.receiptSettings
                }
              }
            : null
        );
        setInstitution(updated);
      }
      setToast('Receipt customization & watermark settings saved successfully!');
      await refreshAuth();
      await loadSettings();
    } catch (err: any) {
      setToast(`Failed to save receipt settings: ${err.message || 'Server error'}`);
    } finally {
      setSavingReceipt(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const handleResetReceiptDefaults = () => {
    setReceiptForm(DEFAULT_RECEIPT_SETTINGS);
    setToast('Reset to default styling. Click "Save Receipt Design" to apply.');
    setTimeout(() => setToast(null), 4000);
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-[28px]">progress_activity</span>
      </div>
    );
  }

  const isConnected = waStatus.state === 'CONNECTED';
  const isQrRequired = waStatus.state === 'QR_REQUIRED' || waStatus.state === 'AUTH_REQUIRED';
  const isConnecting = waStatus.state === 'CONNECTING' || waStatus.state === 'AUTHENTICATING';
  const isLoggedOut = waStatus.state === 'LOGGED_OUT';
  const isReconnecting = waStatus.state === 'RECONNECTING';
  const isError = waStatus.state === 'ERROR';

  return (
    <div className="flex flex-col w-full pb-12 max-w-6xl">
      {/* Toast Feedback */}
      {toast && (
        <div className="fixed top-16 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2.5 border border-outline-variant/30 text-body-sm animate-fade-in">
          <span className="material-symbols-outlined text-secondary-fixed text-[18px]">check_circle</span>
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-outline-variant hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-error">
              <span className="material-symbols-outlined text-[28px]">warning</span>
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                Disconnect WhatsApp Account?
              </h3>
            </div>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              Disconnecting will log out your active WhatsApp Web session and clear credentials on the server.
              Automated outbound messages will be safely held in the queue until a new session is connected.
            </p>
            <div className="p-3 bg-error-container/20 rounded border border-error/20 text-xs text-error font-medium">
              No messages will be sent while WhatsApp is disconnected.
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDisconnectModal(false)}
                className="px-4 py-2 rounded text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                Keep Connected
              </button>
              <button
                onClick={handleConfirmDisconnect}
                disabled={waLoading}
                className="px-4 py-2 rounded bg-error text-on-error text-sm font-semibold hover:bg-error/90 transition-colors flex items-center gap-2"
              >
                {waLoading && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
                <span>Confirm Disconnect</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between py-2 mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">tune</span>
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight font-bold">
              System Settings & Customizer
            </h1>
            <p className="text-xs text-on-surface-variant">
              Configure receipt designs, institutional identity, WhatsApp sessions, and provider integrations
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            loadSettings();
            loadWhatsAppStatus();
          }}
          className="h-8 px-3 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface rounded font-label-sm text-label-sm flex items-center gap-1.5 shadow-2xs transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>Reload</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-2 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('receipt')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === 'receipt'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">receipt_long</span>
          <span>Receipt & Watermark Customizer</span>
          <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
            activeTab === 'receipt' ? 'bg-white text-primary' : 'bg-primary/10 text-primary'
          }`}>
            STUDIO
          </span>
        </button>

        <button
          onClick={() => setActiveTab('institution')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === 'institution'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">domain</span>
          <span>Institution Profile</span>
        </button>

        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === 'whatsapp'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">chat</span>
          <span>WhatsApp Linking</span>
          {isConnected && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('connections')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'connections'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">security</span>
          <span>Providers & Security</span>
        </button>

        {user?.role === 'ADMIN' && (
          <>
            <button
              onClick={() => setActiveTab('accounts')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'accounts'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
              <span>Accounts &amp; Staff</span>
              <span
                className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
                  activeTab === 'accounts' ? 'bg-white text-primary' : 'bg-secondary-container text-on-secondary-container'
                }`}
              >
                ADMIN
              </span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">history_toggle_off</span>
              <span>Audit &amp; Activity Trail</span>
              <span
                className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
                  activeTab === 'audit' ? 'bg-white text-primary' : 'bg-primary/10 text-primary'
                }`}
              >
                LOGS
              </span>
            </button>
          </>
        )}

        <button
          onClick={() => setActiveTab('guide')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'guide'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">menu_book</span>
          <span>Staff Operating Guide</span>
          <span
            className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
              activeTab === 'guide' ? 'bg-white text-primary' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            MANUAL
          </span>
        </button>
      </div>

      {/* TAB 1: RECEIPT & WATERMARK CUSTOMIZER STUDIO */}
      {activeTab === 'receipt' && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Info Banner & Action Buttons */}
          <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 flex items-center justify-between flex-wrap gap-3 shadow-sm">
            <div>
              <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">palette</span>
                <span>Official Receipt Design Studio</span>
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Customize titles, font sizing, logo dimensions, watermark emblem transparency, colors, and disclaimers with real-time print preview.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetReceiptDefaults}
                className="px-3 py-1.5 rounded-lg border border-outline-variant/40 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">restart_alt</span>
                <span>Reset Defaults</span>
              </button>
              <button
                type="button"
                onClick={handleSaveReceiptSettings}
                disabled={savingReceipt}
                className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm"
              >
                {savingReceipt ? (
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">save</span>
                )}
                <span>{savingReceipt ? 'Saving Design...' : 'Save Receipt Design'}</span>
              </button>
            </div>
          </div>

          {/* Two-Column Studio Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Form Controls (7 cols) */}
            <div className="lg:col-span-6 space-y-5">
              {/* Card 1: Header Title & Subtitles */}
              <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">title</span>
                  <span>1. Header & Title Styling</span>
                </h3>

                {/* Title Font Size Slider */}
                <div>
                  <div className="flex justify-between items-center text-xs font-medium text-on-surface mb-1.5">
                    <label>Institution Title Size</label>
                    <span className="font-mono px-2 py-0.5 rounded bg-surface-container text-primary font-bold text-[11px]">
                      {receiptForm.headerTitleSize || 20}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={14}
                    max={32}
                    step={1}
                    value={receiptForm.headerTitleSize || 20}
                    onChange={(e) =>
                      setReceiptForm((prev) => ({ ...prev, headerTitleSize: Number(e.target.value) }))
                    }
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-on-surface-variant mt-0.5">
                    <span>Compact (14px)</span>
                    <span>Standard (20px)</span>
                    <span>Prominent (32px)</span>
                  </div>
                </div>

                {/* Title Color */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1.5">
                    Institution Title Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 p-1 rounded bg-surface-container-low border border-outline-variant/30">
                      <input
                        type="color"
                        value={receiptForm.headerTitleColor || '#111827'}
                        onChange={(e) =>
                          setReceiptForm((prev) => ({ ...prev, headerTitleColor: e.target.value }))
                        }
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-xs font-mono font-semibold px-1 text-on-surface">
                        {receiptForm.headerTitleColor || '#111827'}
                      </span>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex items-center gap-1.5">
                      {COLOR_PRESETS.map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setReceiptForm((prev) => ({ ...prev, headerTitleColor: p.hex }))}
                          title={p.name}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            receiptForm.headerTitleColor === p.hex
                              ? 'scale-115 border-primary shadow-sm'
                              : 'border-white/50 hover:scale-105'
                          }`}
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Subtitle Text */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1">
                    Department / Subtitle Text
                  </label>
                  <input
                    type="text"
                    value={receiptForm.headerSubtitleText || ''}
                    onChange={(e) =>
                      setReceiptForm((prev) => ({ ...prev, headerSubtitleText: e.target.value }))
                    }
                    placeholder="e.g. Institutional Operations & Accounts Department"
                    className="w-full h-8 px-3 rounded bg-surface-container-low border border-outline-variant/30 text-xs font-medium text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Subtitle Size Slider */}
                <div>
                  <div className="flex justify-between items-center text-xs font-medium text-on-surface mb-1.5">
                    <label>Subtitle Font Size</label>
                    <span className="font-mono px-2 py-0.5 rounded bg-surface-container text-primary font-bold text-[11px]">
                      {receiptForm.headerSubtitleSize || 12}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={16}
                    step={1}
                    value={receiptForm.headerSubtitleSize || 12}
                    onChange={(e) =>
                      setReceiptForm((prev) => ({ ...prev, headerSubtitleSize: Number(e.target.value) }))
                    }
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>

                {/* Subtitle Color */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1.5">
                    Subtitle Text Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 p-1 rounded bg-surface-container-low border border-outline-variant/30">
                      <input
                        type="color"
                        value={receiptForm.headerSubtitleColor || '#4b5563'}
                        onChange={(e) =>
                          setReceiptForm((prev) => ({ ...prev, headerSubtitleColor: e.target.value }))
                        }
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-xs font-mono font-semibold px-1 text-on-surface">
                        {receiptForm.headerSubtitleColor || '#4b5563'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {TEXT_COLOR_PRESETS.map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setReceiptForm((prev) => ({ ...prev, headerSubtitleColor: p.hex }))}
                          title={p.name}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            receiptForm.headerSubtitleColor === p.hex
                              ? 'scale-115 border-primary shadow-sm'
                              : 'border-white/50 hover:scale-105'
                          }`}
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Voucher Badge Text */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1">
                    Receipt Badge Title
                  </label>
                  <input
                    type="text"
                    value={receiptForm.badgeText || ''}
                    onChange={(e) =>
                      setReceiptForm((prev) => ({ ...prev, badgeText: e.target.value }))
                    }
                    placeholder="e.g. FEE COLLECTION VOUCHER / OFFICIAL RECEIPT"
                    className="w-full h-8 px-3 rounded bg-surface-container-low border border-outline-variant/30 text-xs font-medium text-on-surface focus:outline-none focus:border-primary uppercase tracking-wider"
                  />
                </div>
              </div>

              {/* Card 2: Header Logo & Watermark Emblem Settings */}
              <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
                  <span>2. Header Logo & Watermark Background</span>
                </h3>

                {/* Header Logo Size & Layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center text-xs font-medium text-on-surface mb-1.5">
                      <label>Header Logo Size</label>
                      <span className="font-mono px-2 py-0.5 rounded bg-surface-container text-primary font-bold text-[11px]">
                        {receiptForm.headerLogoSize || 44}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={28}
                      max={72}
                      step={2}
                      value={receiptForm.headerLogoSize || 44}
                      onChange={(e) =>
                        setReceiptForm((prev) => ({ ...prev, headerLogoSize: Number(e.target.value) }))
                      }
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-on-surface block mb-1.5">
                      Header Logo Layout
                    </label>
                    <div className="flex items-center gap-1.5 bg-surface-container-low p-1 rounded-lg border border-outline-variant/30">
                      <button
                        type="button"
                        onClick={() => setReceiptForm((prev) => ({ ...prev, headerLogoPosition: 'inline' }))}
                        className={`flex-1 py-1 text-xs font-semibold rounded transition-colors ${
                          receiptForm.headerLogoPosition !== 'stacked'
                            ? 'bg-primary text-on-primary shadow-2xs'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        Inline (Side)
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptForm((prev) => ({ ...prev, headerLogoPosition: 'stacked' }))}
                        className={`flex-1 py-1 text-xs font-semibold rounded transition-colors ${
                          receiptForm.headerLogoPosition === 'stacked'
                            ? 'bg-primary text-on-primary shadow-2xs'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        Stacked (Top)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Watermark Section */}
                <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/30 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-on-surface block">
                        Background Watermark Emblem
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        Anti-forgery centered watermark stamped behind payment details
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={receiptForm.showWatermark ?? true}
                        onChange={(e) =>
                          setReceiptForm((prev) => ({ ...prev, showWatermark: e.target.checked }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {receiptForm.showWatermark && (
                    <div className="space-y-3 pt-1 border-t border-outline-variant/20">
                      {/* Watermark Custom Image vs Institution Logo */}
                      <div>
                        <label className="text-[11px] font-semibold text-on-surface-variant block mb-1">
                          Watermark Image Source
                        </label>
                        <div className="flex items-center gap-3 flex-wrap">
                          {receiptForm.watermarkCustomUrl ? (
                            <div className="flex items-center gap-2">
                              <img
                                src={receiptForm.watermarkCustomUrl}
                                alt="Custom Watermark"
                                className="w-10 h-10 object-contain rounded bg-white border border-outline-variant/30 p-0.5"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setReceiptForm((prev) => ({ ...prev, watermarkCustomUrl: '' }))
                                }
                                className="text-xs text-error hover:underline"
                              >
                                Revert to Campus Logo
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-on-surface-variant italic">
                              Using standard Institution Logo as watermark
                            </span>
                          )}

                          <input
                            type="file"
                            id="watermark-custom-input"
                            accept="image/png,image/svg+xml,image/jpeg,image/webp"
                            onChange={handleWatermarkUpload}
                            className="hidden"
                          />
                          <label
                            htmlFor="watermark-custom-input"
                            className="px-2.5 py-1 bg-surface-container hover:bg-surface-container-high text-on-surface rounded text-xs font-semibold cursor-pointer border border-outline-variant/30 flex items-center gap-1 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">upload</span>
                            <span>Upload Custom Watermark Seal</span>
                          </label>
                        </div>
                      </div>

                      {/* Watermark Size Slider */}
                      <div>
                        <div className="flex justify-between items-center text-xs font-medium text-on-surface mb-1">
                          <label>Watermark Size</label>
                          <span className="font-mono px-2 py-0.5 rounded bg-surface-container text-primary font-bold text-[11px]">
                            {receiptForm.watermarkSize || 280}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={140}
                          max={420}
                          step={10}
                          value={receiptForm.watermarkSize || 280}
                          onChange={(e) =>
                            setReceiptForm((prev) => ({ ...prev, watermarkSize: Number(e.target.value) }))
                          }
                          className="w-full accent-primary cursor-pointer"
                        />
                      </div>

                      {/* Watermark Opacity / Transparency Slider */}
                      <div>
                        <div className="flex justify-between items-center text-xs font-medium text-on-surface mb-1">
                          <label>Watermark Opacity / Transparency</label>
                          <span className="font-mono px-2 py-0.5 rounded bg-surface-container text-primary font-bold text-[11px]">
                            {Math.round((receiptForm.watermarkOpacity ?? 0.10) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.02}
                          max={0.35}
                          step={0.01}
                          value={receiptForm.watermarkOpacity ?? 0.10}
                          onChange={(e) =>
                            setReceiptForm((prev) => ({
                              ...prev,
                              watermarkOpacity: Number(e.target.value)
                            }))
                          }
                          className="w-full accent-primary cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-on-surface-variant mt-0.5">
                          <span>Subtle (2%)</span>
                          <span>Balanced (10%)</span>
                          <span>Strong (35%)</span>
                        </div>
                      </div>

                      {/* Watermark Rotation Angle Slider */}
                      <div>
                        <div className="flex justify-between items-center text-xs font-medium text-on-surface mb-1">
                          <label>Watermark Rotation Angle</label>
                          <span className="font-mono px-2 py-0.5 rounded bg-surface-container text-primary font-bold text-[11px]">
                            {receiptForm.watermarkRotation ?? -12}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-45}
                          max={45}
                          step={1}
                          value={receiptForm.watermarkRotation ?? -12}
                          onChange={(e) =>
                            setReceiptForm((prev) => ({
                              ...prev,
                              watermarkRotation: Number(e.target.value)
                            }))
                          }
                          className="w-full accent-primary cursor-pointer"
                        />
                      </div>

                      {/* Grayscale vs Full Color */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-medium text-on-surface">
                          Monochrome / Grayscale Watermark
                        </span>
                        <input
                          type="checkbox"
                          checked={receiptForm.watermarkGrayscale ?? true}
                          onChange={(e) =>
                            setReceiptForm((prev) => ({
                              ...prev,
                              watermarkGrayscale: e.target.checked
                            }))
                          }
                          className="w-4 h-4 rounded text-primary focus:ring-primary"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: Receipt Paper Background & Glassmorphism Transparency */}
              <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">wallpaper</span>
                  <span>3. Receipt Paper Background & Transparency</span>
                </h3>

                {/* Card Background Color */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1.5">
                    Receipt Paper Background Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 p-1 rounded bg-surface-container-low border border-outline-variant/30">
                      <input
                        type="color"
                        value={receiptForm.cardBgColor || '#ffffff'}
                        onChange={(e) =>
                          setReceiptForm((prev) => ({ ...prev, cardBgColor: e.target.value }))
                        }
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-xs font-mono font-semibold px-1 text-on-surface">
                        {receiptForm.cardBgColor || '#ffffff'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {BG_COLOR_PRESETS.map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setReceiptForm((prev) => ({ ...prev, cardBgColor: p.hex }))}
                          title={p.name}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            receiptForm.cardBgColor === p.hex
                              ? 'scale-115 border-primary shadow-sm'
                              : 'border-white/50 hover:scale-105'
                          }`}
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Background Opacity / Transparency */}
                <div>
                  <div className="flex justify-between items-center text-xs font-medium text-on-surface mb-1.5">
                    <label>Paper Opacity / Glassmorphism Transparency</label>
                    <span className="font-mono px-2 py-0.5 rounded bg-surface-container text-primary font-bold text-[11px]">
                      {Math.round((receiptForm.cardBgOpacity ?? 1.0) * 100)}% {receiptForm.cardBgOpacity && receiptForm.cardBgOpacity < 1.0 ? '(Frosted Glass)' : '(Solid)'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={1.0}
                    step={0.02}
                    value={receiptForm.cardBgOpacity ?? 1.0}
                    onChange={(e) =>
                      setReceiptForm((prev) => ({ ...prev, cardBgOpacity: Number(e.target.value) }))
                    }
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-on-surface-variant mt-0.5">
                    <span>High Transparency (40%)</span>
                    <span>Soft Glass (85%)</span>
                    <span>Solid Opaque (100%)</span>
                  </div>
                </div>

                {/* Card Outer Border Color */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1.5">
                    Receipt Card Outer Border Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 p-1 rounded bg-surface-container-low border border-outline-variant/30">
                      <input
                        type="color"
                        value={receiptForm.cardBorderColor || '#e5e7eb'}
                        onChange={(e) =>
                          setReceiptForm((prev) => ({ ...prev, cardBorderColor: e.target.value }))
                        }
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-xs font-mono font-semibold px-1 text-on-surface">
                        {receiptForm.cardBorderColor || '#e5e7eb'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {[
                        { name: 'Light Slate', hex: '#e5e7eb' },
                        { name: 'Border Gray', hex: '#d1d5db' },
                        { name: 'Brand Blue', hex: '#93c5fd' },
                        { name: 'Emerald Soft', hex: '#a7f3d0' },
                        { name: 'Charcoal Line', hex: '#374151' }
                      ].map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setReceiptForm((prev) => ({ ...prev, cardBorderColor: p.hex }))}
                          title={p.name}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            receiptForm.cardBorderColor === p.hex
                              ? 'scale-115 border-primary shadow-sm'
                              : 'border-white/50 hover:scale-105'
                          }`}
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 4: Typography & Complete Text Colors */}
              <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">format_paint</span>
                  <span>4. Typography & Complete Text Colors</span>
                </h3>

                {/* Primary Body Text Color */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1.5">
                    Primary Body Text Color (Student Names, Values, Paid Amounts)
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 p-1 rounded bg-surface-container-low border border-outline-variant/30">
                      <input
                        type="color"
                        value={receiptForm.textColor || '#1f2937'}
                        onChange={(e) =>
                          setReceiptForm((prev) => ({ ...prev, textColor: e.target.value }))
                        }
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-xs font-mono font-semibold px-1 text-on-surface">
                        {receiptForm.textColor || '#1f2937'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {TEXT_COLOR_PRESETS.map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setReceiptForm((prev) => ({ ...prev, textColor: p.hex }))}
                          title={p.name}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            receiptForm.textColor === p.hex
                              ? 'scale-115 border-primary shadow-sm'
                              : 'border-white/50 hover:scale-105'
                          }`}
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Secondary / Label Text Color */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1.5">
                    Secondary / Field Labels Text Color (Field Names, Dates, Descriptions)
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 p-1 rounded bg-surface-container-low border border-outline-variant/30">
                      <input
                        type="color"
                        value={receiptForm.secondaryTextColor || '#6b7280'}
                        onChange={(e) =>
                          setReceiptForm((prev) => ({ ...prev, secondaryTextColor: e.target.value }))
                        }
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-xs font-mono font-semibold px-1 text-on-surface">
                        {receiptForm.secondaryTextColor || '#6b7280'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {[
                        { name: 'Muted Slate', hex: '#64748b' },
                        { name: 'Neutral Gray', hex: '#6b7280' },
                        { name: 'Soft Charcoal', hex: '#4b5563' },
                        { name: 'Navy Tint', hex: '#475569' },
                        { name: 'Silver Muted', hex: '#94a3b8' }
                      ].map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setReceiptForm((prev) => ({ ...prev, secondaryTextColor: p.hex }))}
                          title={p.name}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            receiptForm.secondaryTextColor === p.hex
                              ? 'scale-115 border-primary shadow-sm'
                              : 'border-white/50 hover:scale-105'
                          }`}
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Body Font Size Slider */}
                <div>
                  <div className="flex justify-between items-center text-xs font-medium text-on-surface mb-1.5">
                    <label>Receipt Base Font Size</label>
                    <span className="font-mono px-2 py-0.5 rounded bg-surface-container text-primary font-bold text-[11px]">
                      {receiptForm.bodyFontSize || 12}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={16}
                    step={1}
                    value={receiptForm.bodyFontSize || 12}
                    onChange={(e) =>
                      setReceiptForm((prev) => ({ ...prev, bodyFontSize: Number(e.target.value) }))
                    }
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-on-surface-variant mt-0.5">
                    <span>Compact (10px)</span>
                    <span>Standard (12px)</span>
                    <span>Spacious (16px)</span>
                  </div>
                </div>
              </div>

              {/* Card 5: Section Fill, Table Borders & Signature */}
              <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 border-b border-outline-variant/20 pb-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">table_chart</span>
                  <span>5. Section Fill, Table Borders & Signature</span>
                </h3>

                {/* Primary Accent Color */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1.5">
                    Primary Accent Color (Receipt No, Voucher Badge, Dividers)
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 p-1 rounded bg-surface-container-low border border-outline-variant/30">
                      <input
                        type="color"
                        value={receiptForm.primaryColor || '#1e40af'}
                        onChange={(e) =>
                          setReceiptForm((prev) => ({ ...prev, primaryColor: e.target.value }))
                        }
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-xs font-mono font-semibold px-1 text-on-surface">
                        {receiptForm.primaryColor || '#1e40af'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {COLOR_PRESETS.map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setReceiptForm((prev) => ({ ...prev, primaryColor: p.hex }))}
                          title={p.name}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            receiptForm.primaryColor === p.hex
                              ? 'scale-115 border-primary shadow-sm'
                              : 'border-white/50 hover:scale-105'
                          }`}
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Details Box & Table Header Background */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1.5">
                    Student Details Card & Table Header Background
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 p-1 rounded bg-surface-container-low border border-outline-variant/30">
                      <input
                        type="color"
                        value={receiptForm.sectionBgColor || '#f8fafc'}
                        onChange={(e) =>
                          setReceiptForm((prev) => ({ ...prev, sectionBgColor: e.target.value }))
                        }
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-xs font-mono font-semibold px-1 text-on-surface">
                        {receiptForm.sectionBgColor || '#f8fafc'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {BG_COLOR_PRESETS.map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setReceiptForm((prev) => ({ ...prev, sectionBgColor: p.hex }))}
                          title={p.name}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            receiptForm.sectionBgColor === p.hex
                              ? 'scale-115 border-primary shadow-sm'
                              : 'border-white/50 hover:scale-105'
                          }`}
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Table Grid & Divider Lines Color */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1.5">
                    Table Grid & Divider Lines Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 p-1 rounded bg-surface-container-low border border-outline-variant/30">
                      <input
                        type="color"
                        value={receiptForm.tableBorderColor || '#e2e8f0'}
                        onChange={(e) =>
                          setReceiptForm((prev) => ({ ...prev, tableBorderColor: e.target.value }))
                        }
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-xs font-mono font-semibold px-1 text-on-surface">
                        {receiptForm.tableBorderColor || '#e2e8f0'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {[
                        { name: 'Light Slate', hex: '#e2e8f0' },
                        { name: 'Standard Gray', hex: '#d1d5db' },
                        { name: 'Soft Blue', hex: '#bfdbfe' },
                        { name: 'Soft Dark', hex: '#4b5563' }
                      ].map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setReceiptForm((prev) => ({ ...prev, tableBorderColor: p.hex }))}
                          title={p.name}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            receiptForm.tableBorderColor === p.hex
                              ? 'scale-115 border-primary shadow-sm'
                              : 'border-white/50 hover:scale-105'
                          }`}
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer Notes Disclaimer */}
                <div>
                  <label className="text-xs font-medium text-on-surface block mb-1">
                    Footer Disclaimers & Notes
                  </label>
                  <textarea
                    rows={2}
                    value={receiptForm.footerNotes || ''}
                    onChange={(e) =>
                      setReceiptForm((prev) => ({ ...prev, footerNotes: e.target.value }))
                    }
                    placeholder="• Computer generated official receipt.&#10;• Verified against institutional ledger."
                    className="w-full p-2.5 rounded bg-surface-container-low border border-outline-variant/30 text-xs font-medium text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Signatory Label */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="text-xs font-medium text-on-surface block mb-1">
                      Signatory Designation
                    </label>
                    <input
                      type="text"
                      value={receiptForm.signatoryLabel || ''}
                      onChange={(e) =>
                        setReceiptForm((prev) => ({ ...prev, signatoryLabel: e.target.value }))
                      }
                      placeholder="e.g. Authorized Signatory"
                      className="w-full h-8 px-3 rounded bg-surface-container-low border border-outline-variant/30 text-xs font-medium text-on-surface focus:outline-none focus:border-primary uppercase"
                    />
                  </div>

                  <div className="flex items-center gap-2 pb-1.5">
                    <input
                      type="checkbox"
                      id="sig-line-toggle"
                      checked={receiptForm.showSignatoryLine ?? true}
                      onChange={(e) =>
                        setReceiptForm((prev) => ({
                          ...prev,
                          showSignatoryLine: e.target.checked
                        }))
                      }
                      className="w-4 h-4 rounded text-primary focus:ring-primary"
                    />
                    <label htmlFor="sig-line-toggle" className="text-xs font-medium text-on-surface cursor-pointer">
                      Show Signature Line
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Live Photorealistic Receipt Preview (6 cols) */}
            <div className="lg:col-span-6 sticky top-6 space-y-3">
              <div className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant/30 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                    Live Preview (Exact Print Engine)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-2.5 py-1 bg-surface-container hover:bg-surface-container-high rounded text-xs font-semibold text-on-surface flex items-center gap-1 transition-colors"
                  title="Test Print"
                >
                  <span className="material-symbols-outlined text-[14px]">print</span>
                  <span>Test Print</span>
                </button>
              </div>

              {/* The Live Receipt Paper */}
              <div className="bg-surface-container-low p-2 rounded-xl border border-outline-variant/30 shadow-lg">
                <ReceiptPaper
                  receipt={DUMMY_RECEIPT}
                  customSettings={receiptForm}
                  className="shadow-md rounded-lg"
                />
              </div>

              <div className="text-center text-[11px] text-on-surface-variant flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-primary">info</span>
                <span>Any modification automatically updates this live paper receipt in real-time.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INSTITUTION PROFILE */}
      {activeTab === 'institution' && (
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/20 animate-fade-in space-y-4">
          <div className="flex items-center justify-between mb-space-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2 font-semibold">
              <span className="material-symbols-outlined text-primary text-[20px]">domain</span>
              <span>Institution Profile & Official Seal</span>
            </h2>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-xs font-medium text-on-surface flex items-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">edit</span>
                <span>Edit Profile</span>
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-1 rounded bg-surface-container text-xs text-on-surface-variant hover:text-on-surface"
              >
                Cancel
              </button>
            )}
          </div>

          {!isEditing ? (
            <div className="space-y-4">
              {/* Logo Preview Banner */}
              <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {settings?.institution?.logoUrl ? (
                    <img
                      src={settings.institution.logoUrl}
                      alt="Campus Seal"
                      className="w-14 h-14 object-contain rounded bg-white p-1 shadow-sm border border-outline-variant/30"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded bg-primary/10 border border-primary/20 flex flex-col items-center justify-center text-primary">
                      <span className="material-symbols-outlined text-[24px]">verified</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider">Default</span>
                    </div>
                  )}
                  <div>
                    <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                      <span>Official Campus Seal / Logo</span>
                      <span className="px-1.5 py-0.2 rounded bg-secondary-container text-on-secondary-container text-[10px] font-semibold">
                        Receipt Watermark Active
                      </span>
                    </span>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {settings?.institution?.logoUrl
                        ? 'Custom logo active: printed in receipt headers and embedded as center watermark.'
                        : 'No custom logo uploaded. System using official default institutional seal.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 bg-surface-container hover:bg-surface-container-high rounded text-xs font-semibold text-on-surface flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">upload</span>
                  <span>{settings?.institution?.logoUrl ? 'Change Logo' : 'Upload Logo'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md text-body-sm pt-2">
                <div>
                  <span className="font-label-sm text-on-surface-variant block text-xs">Institution Name</span>
                  <span className="font-semibold text-on-surface mt-1 block">
                    {settings?.institution?.name || 'Not Configured'}
                  </span>
                </div>
                <div>
                  <span className="font-label-sm text-on-surface-variant block text-xs">Institution Code</span>
                  <span className="font-data-mono text-on-surface mt-1 block font-semibold">
                    {settings?.institution?.code || 'INST'}
                  </span>
                </div>
                <div>
                  <span className="font-label-sm text-on-surface-variant block text-xs">Operational Timezone</span>
                  <span className="font-data-mono text-on-surface mt-1 block">
                    {settings?.institution?.timezone || 'Asia/Kolkata'}
                  </span>
                </div>
                <div>
                  <span className="font-label-sm text-on-surface-variant block text-xs">Default Country Code</span>
                  <span className="font-data-mono font-semibold text-secondary mt-1 block">
                    {settings?.institution?.defaultCountryCode || '+91'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveInstitution} className="space-y-4">
              {/* Logo Upload Box */}
              <div className="p-3 bg-surface-container-low rounded border border-outline-variant/30 space-y-2">
                <label className="text-xs font-semibold text-on-surface block">
                  Campus Logo & Receipt Watermark
                </label>
                <div className="flex items-center gap-4 flex-wrap">
                  {editLogoUrl ? (
                    <div className="relative group">
                      <img
                        src={editLogoUrl}
                        alt="Logo Preview"
                        className="w-16 h-16 object-contain rounded bg-white p-1 border border-outline-variant/40 shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setEditLogoUrl('')}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error text-white text-xs flex items-center justify-center shadow"
                        title="Remove Logo"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded border-2 border-dashed border-outline-variant/40 flex flex-col items-center justify-center text-outline text-xs">
                      <span className="material-symbols-outlined text-[20px]">image</span>
                      <span className="text-[9px]">No Logo</span>
                    </div>
                  )}

                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="file"
                      id="logo-file-input"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <label
                      htmlFor="logo-file-input"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_photo_alternate</span>
                      <span>{editLogoUrl ? 'Choose Different Image' : 'Select Logo Image'}</span>
                    </label>
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Recommended: PNG or SVG with transparent background (Max: 2MB). Automatically applied to Receipt Watermark & Header.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-on-surface-variant block mb-1">Institution Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-9 px-3 rounded bg-surface-container-low border border-outline-variant/30 text-sm font-medium text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-on-surface-variant block mb-1">Timezone</label>
                <select
                  value={editTimezone}
                  onChange={(e) => setEditTimezone(e.target.value)}
                  className="w-full h-9 px-3 rounded bg-surface-container-low border border-outline-variant/30 text-sm text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                  <option value="UTC">UTC (+00:00)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST +04:00)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT +08:00)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditLogoUrl(settings?.institution?.logoUrl || '');
                  }}
                  className="px-3 py-1.5 rounded text-xs text-on-surface-variant hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving && <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>}
                  <span>{saving ? 'Saving...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 3: WHATSAPP ACCOUNT LINKING */}
      {activeTab === 'whatsapp' && (
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/20 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <span className="material-symbols-outlined text-[24px]">chat</span>
              </div>
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-2">
                  <span>WhatsApp Account Linking</span>
                  <span className="text-xs font-data-mono font-normal text-on-surface-variant">(Baileys Web)</span>
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Official WhatsApp Web session connection for automated institutional notifications & helpdesk
                </p>
              </div>
            </div>

            {/* Live Connection State Badge */}
            <div>
              {isConnected && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>CONNECTED ✓</span>
                </span>
              )}
              {isQrRequired && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 border border-amber-500/30">
                  <span className="material-symbols-outlined text-[14px]">qr_code</span>
                  <span>QR REQUIRED</span>
                </span>
              )}
              {isConnecting && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 border border-amber-500/30">
                  <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                  <span>CONNECTING...</span>
                </span>
              )}
              {isReconnecting && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 border border-amber-500/30">
                  <span className="material-symbols-outlined animate-spin text-[14px]">sync</span>
                  <span>RECONNECTING...</span>
                </span>
              )}
              {isLoggedOut && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-700 border border-rose-500/30">
                  <span className="material-symbols-outlined text-[14px]">logout</span>
                  <span>LOGGED OUT</span>
                </span>
              )}
              {isError && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-700 border border-red-500/30">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  <span>ERROR</span>
                </span>
              )}
              {!isConnected && !isQrRequired && !isConnecting && !isReconnecting && !isLoggedOut && !isError && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-surface-container text-on-surface-variant border border-outline-variant/30">
                  <span className="w-2 h-2 rounded-full bg-outline"></span>
                  <span>NOT CONNECTED</span>
                </span>
              )}
            </div>
          </div>

          {/* Mock Mode Notice */}
          {waStatus.provider === 'mock' && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs space-y-1">
              <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                <span className="material-symbols-outlined text-[18px]">info</span>
                <span>WhatsApp Mock Sandbox Active</span>
              </div>
              <p className="text-amber-700/90 dark:text-amber-400">
                The application is running in <strong>Mock Mode</strong>. Clicking Connect WhatsApp simulates linking with dummy number <strong>+91 ••••• 0000</strong>. To scan a real WhatsApp QR code and link your actual phone, ensure your backend is running in Real Mode on a persistent 24/7 host (such as Render).
              </p>
            </div>
          )}

          {/* Conditional Sub-views based on Connection State */}
          {isLoggedOut && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-amber-800 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">info</span>
              <span>WhatsApp account needs to be linked again.</span>
            </div>
          )}

          {isReconnecting && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-amber-800 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
              <span>WhatsApp disconnected. Reconnecting...</span>
            </div>
          )}

          {isError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-800 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{waStatus.lastError || 'Unable to generate WhatsApp QR. Please try again.'}</span>
            </div>
          )}

          {!isConnected && !isQrRequired && !isConnecting && (
            <div className="p-4 bg-surface-container-low rounded border border-outline-variant/30 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="text-sm font-semibold text-on-surface">No Active WhatsApp Session</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">
                    Click Connect WhatsApp to start the Baileys session and scan the linking QR code with your mobile device.
                  </div>
                </div>
                <button
                  onClick={handleConnectWhatsApp}
                  disabled={waLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
                >
                  {waLoading && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
                  <span>Connect WhatsApp</span>
                </button>
              </div>
            </div>
          )}

          {isQrRequired && (
            <div className="p-5 bg-surface-container-low rounded border border-outline-variant/30 flex flex-col md:flex-row items-center gap-6">
              <div className="bg-white p-3 rounded-lg shadow-sm border border-outline-variant/30 flex flex-col items-center">
                {waStatus.qrCode ? (
                  <img src={waStatus.qrCode} alt="WhatsApp QR Code" className="w-56 h-56 object-contain" />
                ) : (
                  <div className="w-56 h-56 flex flex-col items-center justify-center text-outline text-xs">
                    <span className="material-symbols-outlined animate-spin text-[32px] mb-2">progress_activity</span>
                    <span>Rendering QR code...</span>
                  </div>
                )}
                <span className="text-[11px] font-data-mono text-outline mt-2">Scan with WhatsApp &gt; Linked devices</span>
              </div>

              <div className="flex-1 space-y-3">
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Link Institutional WhatsApp Account
                </h3>
                <ol className="text-xs text-on-surface-variant space-y-1.5 list-decimal list-inside">
                  <li>Open WhatsApp on the institution's official phone</li>
                  <li>Tap <strong>Settings</strong> or <strong>Menu (⋮)</strong> &gt; <strong>Linked Devices</strong></li>
                  <li>Tap <strong>Link a Device</strong> and point your camera at this QR code</li>
                </ol>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleRefreshQr}
                    disabled={waLoading}
                    className="px-3 py-1.5 bg-surface-container hover:bg-surface-container-high text-xs font-semibold rounded text-on-surface border border-outline-variant/30 flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[15px]">refresh</span>
                    <span>Refresh QR Code</span>
                  </button>
                  <button
                    onClick={handleCancelConnect}
                    disabled={waLoading}
                    className="px-3 py-1.5 text-xs font-semibold rounded text-error hover:bg-error-container/20 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {isConnecting && (
            <div className="p-6 bg-surface-container-low rounded border border-outline-variant/30 flex flex-col items-center justify-center space-y-2">
              <span className="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span>
              <span className="text-sm font-semibold text-on-surface">Connecting to WhatsApp Web...</span>
              <span className="text-xs text-on-surface-variant">Syncing session credentials with Baileys provider</span>
            </div>
          )}

          {isConnected && (
            <div className="p-4 bg-emerald-500/5 rounded border border-emerald-500/20 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 text-[20px]">verified</span>
                  <span className="text-xs font-bold text-emerald-800">
                    Active & Ready for Automated Inbound/Outbound Dispatch
                  </span>
                </div>
                <button
                  onClick={() => setShowDisconnectModal(true)}
                  className="px-3 py-1 text-xs font-semibold rounded bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 border border-rose-500/20 transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">link_off</span>
                  <span>Disconnect WhatsApp</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                <div className="p-2.5 bg-surface-container-lowest rounded border border-outline-variant/20">
                  <span className="text-on-surface-variant block text-[11px]">Linked Number</span>
                  <span className="font-data-mono font-bold text-on-surface mt-0.5 block">
                    {waStatus.maskedPhone || 'No Number Linked'}
                  </span>
                  {waStatus.provider === 'mock' && (
                    <span className="text-[10px] text-amber-600 block mt-0.5 font-medium">Simulated Mock Account</span>
                  )}
                </div>
                <div className="p-2.5 bg-surface-container-lowest rounded border border-outline-variant/20">
                  <span className="text-on-surface-variant block text-[11px]">Session Persistence</span>
                  <span className={`font-semibold mt-0.5 block ${waStatus.provider === 'mock' ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {waStatus.provider === 'mock' ? 'Mock In-Memory (Simulated)' : 'Persisted on Disk ✓'}
                  </span>
                </div>
                <div className="p-2.5 bg-surface-container-lowest rounded border border-outline-variant/20">
                  <span className="text-on-surface-variant block text-[11px]">Outbound Concurrency</span>
                  <span className="font-data-mono font-bold text-on-surface mt-0.5 block">
                    1 Active Send (10s delay)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: EXTERNAL SERVICE PROVIDERS & SECURITY STATE */}
      {activeTab === 'connections' && (
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/20 animate-fade-in">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-md flex items-center gap-2 font-semibold">
            <span className="material-symbols-outlined text-secondary text-[20px]">security</span>
            <span>External Service Providers & Security State</span>
          </h2>
          <div className="space-y-3">
            {/* Razorpay */}
            <div className="p-space-xs bg-surface-container-low rounded flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[20px]">payments</span>
                <div>
                  <span className="font-semibold text-on-surface block font-label-sm">Razorpay Payment Gateway</span>
                  <span className="text-[11px] font-data-mono text-on-surface-variant">
                    Mode: {settings?.connections?.razorpay?.mode?.toUpperCase() || 'TEST'} | Key ID: {settings?.connections?.razorpay?.keyIdMasked || '••••••••'} | Secrets: Server-Side Only
                  </span>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded font-data-mono text-[10px] font-bold ${
                  settings?.connections?.razorpay?.connected
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'bg-surface-container text-outline'
                }`}
              >
                {settings?.connections?.razorpay?.status || 'CONFIGURED'}
              </span>
            </div>

            {/* WhatsApp Summary */}
            <div className="p-space-xs bg-surface-container-low rounded flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-emerald-600 text-[20px]">chat</span>
                <div>
                  <span className="font-semibold text-on-surface block font-label-sm">WhatsApp Web Engine (Baileys)</span>
                  <span className="text-[11px] font-data-mono text-on-surface-variant">
                    State: {waStatus.state} | Account: {waStatus.maskedPhone || 'Not Linked'} | Pacing: 10s Minimum
                  </span>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded font-data-mono text-[10px] font-bold ${
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30'
                    : 'bg-surface-container text-outline'
                }`}
              >
                {isConnected ? 'CONNECTED ✓' : waStatus.state}
              </span>
            </div>

            {/* Google Sheets */}
            <div className="p-space-xs bg-surface-container-low rounded flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-outline text-[20px]">table_chart</span>
                <div>
                  <span className="font-semibold text-on-surface block font-label-sm">Google Sheets Engine</span>
                  <span className="text-[11px] font-data-mono text-on-surface-variant">
                    Source Sheet: {settings?.connections?.googleSheets?.source || 'Students_Master'} | Ingestion Adapter: OAuth 2.0
                  </span>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded font-data-mono text-[10px] font-bold ${
                  settings?.connections?.googleSheets?.connected
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'bg-surface-container text-outline'
                }`}
              >
                {settings?.connections?.googleSheets?.status || 'CONNECTED'}
              </span>
            </div>

            {/* AI Assistant */}
            <div className="p-space-xs bg-surface-container-low rounded flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-outline text-[20px]">psychology</span>
                <div>
                  <span className="font-semibold text-on-surface block font-label-sm">AI Assistance Module</span>
                  <span className="text-[11px] font-data-mono text-on-surface-variant">
                    Status: {settings?.connections?.ai?.status || 'Disabled (Optional)'}
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-data-mono text-[10px] font-bold">
                {settings?.connections?.ai?.enabled ? 'ACTIVE' : 'OPTIONAL'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ACCOUNTS & STAFF MANAGEMENT (ADMIN-ONLY) */}
      {activeTab === 'accounts' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Card */}
          <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 flex items-center justify-between flex-wrap gap-4 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-on-surface">Institutional Staff &amp; Operator Accounts</h3>
                <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-mono font-semibold">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                Only Administrators can provision new staff. Newly invited staff members must verify their email with a 6-digit Resend OTP upon first login.
              </p>
            </div>

            <button
              onClick={() => {
                setStaffForm({
                  name: '',
                  email: '',
                  password: `Pass@${Math.floor(1000 + Math.random() * 9000)}`,
                  role: 'STAFF',
                  scheduleMode: 'ALWAYS',
                  shiftStart: '09:00',
                  shiftEnd: '18:00',
                  expiresAt: '',
                  permissions: ['COLLECT_PAYMENTS', 'RECORD_OFFLINE', 'VIEW_STUDENTS']
                });
                setShowAddStaffModal(true);
              }}
              className="h-10 px-4 bg-primary hover:bg-primary/90 text-on-primary rounded-xl font-semibold text-sm flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[19px]">person_add</span>
              <span>+ Add New Staff Member</span>
            </button>
          </div>

          {/* Staff Accounts Table */}
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/25 text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider text-xs">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4">Shift &amp; Access Window</th>
                    <th className="py-3 px-4">Assigned Permissions</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15 text-sm text-on-surface">
                  {staffLoading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-on-surface-variant">
                        <div className="flex items-center justify-center gap-2">
                          <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                          <span>Loading staff directory...</span>
                        </div>
                      </td>
                    </tr>
                  ) : staffList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-on-surface-variant">
                        <span className="material-symbols-outlined text-[36px] text-outline block mb-1">group_off</span>
                        <p className="font-semibold text-on-surface">No staff members created yet</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">Click "+ Add New Staff Member" to invite your first operator.</p>
                      </td>
                    </tr>
                  ) : (
                    staffList.map((st: any) => {
                      const isSelf = st.id === user?.id;
                      const isActive = st.isActive !== false;
                      const schedule = st.accessSchedule || { mode: 'ALWAYS' };

                      return (
                        <tr key={st.id} className="hover:bg-surface-container-low/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                                {st.name?.slice(0, 2).toUpperCase() || 'ST'}
                              </div>
                              <div>
                                <div className="font-semibold text-on-surface flex items-center gap-1.5">
                                  <span>{st.name}</span>
                                  {isSelf && (
                                    <span className="text-[10px] px-1.5 py-0.2 bg-primary/10 text-primary rounded font-mono font-bold">
                                      YOU
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-on-surface-variant font-mono">{st.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                                st.role === 'ADMIN'
                                  ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'
                                  : st.role === 'CASHIER'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                  : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                              }`}
                            >
                              {st.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {/* 1-Click Active / Suspended Switch */}
                              <button
                                onClick={() => handleToggleStaffActive(st)}
                                disabled={isSelf}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                                  isActive ? 'bg-emerald-600' : 'bg-outline-variant'
                                }`}
                                title={isSelf ? 'Cannot deactivate self' : (isActive ? 'Click to Suspend Account' : 'Click to Activate Account')}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                    isActive ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                              <span
                                className={`text-xs font-semibold ${
                                  isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-error font-medium'
                                }`}
                              >
                                {isActive ? 'Active' : 'Suspended'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {schedule.mode === 'ALWAYS' ? (
                              <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant font-medium bg-surface-container px-2 py-0.5 rounded-full border border-outline-variant/30">
                                <span className="material-symbols-outlined text-[14px] text-emerald-600">all_inclusive</span>
                                <span>24/7 Always Active</span>
                              </span>
                            ) : schedule.mode === 'SHIFT_WINDOW' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                                <span className="material-symbols-outlined text-[14px]">schedule</span>
                                <span>{schedule.shiftStart || '09:00'} - {schedule.shiftEnd || '18:00'}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                <span className="material-symbols-outlined text-[14px]">event_busy</span>
                                <span>Exp: {schedule.expiresAt ? new Date(schedule.expiresAt).toLocaleDateString() : 'N/A'}</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1 flex-wrap max-w-xs">
                              {(st.permissions || ['COLLECT_PAYMENTS', 'RECORD_OFFLINE']).slice(0, 2).map((perm: string) => (
                                <span
                                  key={perm}
                                  className="text-[10px] px-1.5 py-0.5 bg-surface-container text-on-surface-variant rounded border border-outline-variant/30 font-mono"
                                >
                                  {perm.replace('_', ' ')}
                                </span>
                              ))}
                              {(st.permissions || []).length > 2 && (
                                <span className="text-[10px] text-outline font-semibold">
                                  +{(st.permissions || []).length - 2} more
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openEditStaffModal(st)}
                                className="h-8 px-2.5 text-xs text-primary hover:bg-primary/10 rounded-lg border border-primary/30 font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                                title="Edit Shift Window & Permissions"
                              >
                                <span className="material-symbols-outlined text-[16px]">tune</span>
                                <span>Configure</span>
                              </button>

                              {!isSelf && (
                                <button
                                  onClick={() => handleDeleteStaff(st.id, st.name)}
                                  disabled={deletingStaffId === st.id}
                                  className="h-8 px-2 text-xs text-error hover:bg-error-container/20 rounded-lg border border-error/30 font-semibold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="Remove staff account"
                                >
                                  <span className="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Staff Modal */}
          {showAddStaffModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-2xl max-w-lg w-full p-6 animate-scale-up my-8 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4 sticky top-0 bg-surface-container-lowest z-10">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[24px]">person_add</span>
                    <h3 className="font-bold text-lg text-on-surface">Provision Staff / Cashier</h3>
                  </div>
                  <button
                    onClick={() => setShowAddStaffModal(false)}
                    className="w-8 h-8 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleAddStaff} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Staff Full Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar"
                      value={staffForm.name}
                      onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Staff Email (Gmail or College Email)
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. ramesh@college.edu or ramesh@gmail.com"
                      value={staffForm.email}
                      onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Login credentials &amp; 1st-time OTP verification code will be dispatched via Resend.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Role &amp; Responsibilities
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setStaffForm({ ...staffForm, role: 'STAFF' })}
                        className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                          staffForm.role === 'STAFF'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-outline-variant/30 text-on-surface hover:bg-surface-container-low'
                        }`}
                      >
                        <div className="font-bold flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">badge</span>
                          <span>Staff Operator</span>
                        </div>
                        <div className="text-[10px] opacity-75 font-normal mt-0.5">Directory &amp; General Ops</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStaffForm({ ...staffForm, role: 'CASHIER' })}
                        className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                          staffForm.role === 'CASHIER'
                            ? 'border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : 'border-outline-variant/30 text-on-surface hover:bg-surface-container-low'
                        }`}
                      >
                        <div className="font-bold flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">point_of_sale</span>
                          <span>Cashier Desk</span>
                        </div>
                        <div className="text-[10px] opacity-75 font-normal mt-0.5">Counter cash &amp; receipts</div>
                      </button>
                    </div>
                  </div>

                  {/* Access Schedule & Shift Window Mode */}
                  <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/30 space-y-3">
                    <label className="block text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[18px]">access_time</span>
                      <span>Access Schedule / Working Hours Mode</span>
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setStaffForm({ ...staffForm, scheduleMode: 'ALWAYS' })}
                        className={`p-2 rounded-lg border text-center text-xs font-semibold transition-all cursor-pointer ${
                          staffForm.scheduleMode === 'ALWAYS'
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-outline-variant/30 text-on-surface hover:bg-surface-container'
                        }`}
                      >
                        24/7 Always Active
                      </button>

                      <button
                        type="button"
                        onClick={() => setStaffForm({ ...staffForm, scheduleMode: 'SHIFT_WINDOW' })}
                        className={`p-2 rounded-lg border text-center text-xs font-semibold transition-all cursor-pointer ${
                          staffForm.scheduleMode === 'SHIFT_WINDOW'
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-outline-variant/30 text-on-surface hover:bg-surface-container'
                        }`}
                      >
                        Shift Window
                      </button>

                      <button
                        type="button"
                        onClick={() => setStaffForm({ ...staffForm, scheduleMode: 'EXPIRING' })}
                        className={`p-2 rounded-lg border text-center text-xs font-semibold transition-all cursor-pointer ${
                          staffForm.scheduleMode === 'EXPIRING'
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-outline-variant/30 text-on-surface hover:bg-surface-container'
                        }`}
                      >
                        Expiring Access
                      </button>
                    </div>

                    {staffForm.scheduleMode === 'SHIFT_WINDOW' && (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                            Shift Start Time
                          </label>
                          <input
                            type="time"
                            value={staffForm.shiftStart}
                            onChange={(e) => setStaffForm({ ...staffForm, shiftStart: e.target.value })}
                            className="w-full h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-sm font-mono text-on-surface"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                            Shift End Time
                          </label>
                          <input
                            type="time"
                            value={staffForm.shiftEnd}
                            onChange={(e) => setStaffForm({ ...staffForm, shiftEnd: e.target.value })}
                            className="w-full h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-sm font-mono text-on-surface"
                          />
                        </div>
                        <p className="text-[11px] text-primary col-span-2">
                          ⏱️ Outside these hours, login and cashier operations will be automatically rejected.
                        </p>
                      </div>
                    )}

                    {staffForm.scheduleMode === 'EXPIRING' && (
                      <div className="pt-2">
                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                          Expiry Date (End of Duty)
                        </label>
                        <input
                          type="date"
                          value={staffForm.expiresAt}
                          onChange={(e) => setStaffForm({ ...staffForm, expiresAt: e.target.value })}
                          className="w-full h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-sm text-on-surface"
                        />
                      </div>
                    )}
                  </div>

                  {/* Granular Permission Checkboxes */}
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                      Granular Staff Permissions
                    </label>
                    <div className="space-y-1.5 bg-surface-container-low p-3 rounded-xl border border-outline-variant/30">
                      {[
                        { key: 'COLLECT_PAYMENTS', label: 'Collect Cash / UPI & Generate Receipts', desc: 'Permits cashier offline payments' },
                        { key: 'RECORD_OFFLINE', label: 'Record Cash Ledger Entries', desc: 'Permits student fee register logs' },
                        { key: 'ADJUST_FEES', label: 'Fee Structure Adjustments', desc: 'Permits discounts & due modifications' },
                        { key: 'WAIVE_FINES', label: 'Late Fine Waivers', desc: 'Permits fine amount nullification' },
                        { key: 'VIEW_STUDENTS', label: 'View Student Master Directory', desc: 'Permits read-only balance lookups' }
                      ].map((item) => {
                        const checked = staffForm.permissions.includes(item.key);
                        return (
                          <label key={item.key} className="flex items-start gap-2.5 cursor-pointer p-1.5 rounded hover:bg-surface-container/50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setStaffForm({ ...staffForm, permissions: [...staffForm.permissions, item.key] });
                                } else {
                                  setStaffForm({ ...staffForm, permissions: staffForm.permissions.filter((p) => p !== item.key) });
                                }
                              }}
                              className="mt-0.5 rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                            />
                            <div>
                              <div className="text-xs font-semibold text-on-surface">{item.label}</div>
                              <div className="text-[10px] text-on-surface-variant">{item.desc}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Initial Temporary Password
                    </label>
                    <input
                      type="text"
                      required
                      value={staffForm.password}
                      onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>

                  <div className="p-3 bg-secondary-container/20 border border-secondary/30 rounded-xl text-xs text-on-surface flex items-start gap-2">
                    <span className="material-symbols-outlined text-secondary text-[18px] shrink-0 mt-0.5">verified_user</span>
                    <span>
                      <strong>OTP Security:</strong> When the staff logs in for the first time, AlphaXync will dispatch an instant 6-digit email OTP for authorization.
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                    <button
                      type="button"
                      onClick={() => setShowAddStaffModal(false)}
                      className="h-10 px-4 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingStaff}
                      className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-on-primary text-sm font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer active:scale-95"
                    >
                      {creatingStaff ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                          <span>Creating &amp; Dispatching Email...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">send</span>
                          <span>Provision &amp; Send Invite</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit Staff & Access Schedule Modal */}
          {editingStaff && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-2xl max-w-lg w-full p-6 animate-scale-up my-8 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4 sticky top-0 bg-surface-container-lowest z-10">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[24px]">tune</span>
                    <h3 className="font-bold text-lg text-on-surface">Configure Staff &amp; Shift Window</h3>
                  </div>
                  <button
                    onClick={() => setEditingStaff(null)}
                    className="w-8 h-8 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveEditStaff} className="space-y-4">
                  <div className="p-3 bg-surface-container-low rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-on-surface-variant">Account Status</div>
                      <div className="text-sm font-bold text-on-surface">{editStaffForm.isActive ? 'Active' : 'Suspended'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditStaffForm({ ...editStaffForm, isActive: !editStaffForm.isActive })}
                      disabled={editingStaff.id === user?.id}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        editStaffForm.isActive ? 'bg-emerald-600' : 'bg-outline-variant'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          editStaffForm.isActive ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Staff Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editStaffForm.name}
                      onChange={(e) => setEditStaffForm({ ...editStaffForm, name: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Assigned Role
                    </label>
                    <select
                      value={editStaffForm.role}
                      onChange={(e) => setEditStaffForm({ ...editStaffForm, role: e.target.value as any })}
                      disabled={editingStaff.id === user?.id}
                      className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm focus:outline-none focus:border-primary text-on-surface"
                    >
                      <option value="STAFF">Staff Operator</option>
                      <option value="CASHIER">Cashier Desk</option>
                      <option value="ADMIN">System Administrator</option>
                    </select>
                  </div>

                  {/* Access Schedule & Shift Window Mode */}
                  <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/30 space-y-3">
                    <label className="block text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
                      <span>Access Schedule / Shift Window</span>
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditStaffForm({ ...editStaffForm, scheduleMode: 'ALWAYS' })}
                        className={`p-2 rounded-lg border text-center text-xs font-semibold transition-all cursor-pointer ${
                          editStaffForm.scheduleMode === 'ALWAYS'
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-outline-variant/30 text-on-surface hover:bg-surface-container'
                        }`}
                      >
                        Always Active
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditStaffForm({ ...editStaffForm, scheduleMode: 'SHIFT_WINDOW' })}
                        className={`p-2 rounded-lg border text-center text-xs font-semibold transition-all cursor-pointer ${
                          editStaffForm.scheduleMode === 'SHIFT_WINDOW'
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-outline-variant/30 text-on-surface hover:bg-surface-container'
                        }`}
                      >
                        Shift Window
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditStaffForm({ ...editStaffForm, scheduleMode: 'EXPIRING' })}
                        className={`p-2 rounded-lg border text-center text-xs font-semibold transition-all cursor-pointer ${
                          editStaffForm.scheduleMode === 'EXPIRING'
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-outline-variant/30 text-on-surface hover:bg-surface-container'
                        }`}
                      >
                        Expiring Access
                      </button>
                    </div>

                    {editStaffForm.scheduleMode === 'SHIFT_WINDOW' && (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                            Shift Start Time
                          </label>
                          <input
                            type="time"
                            value={editStaffForm.shiftStart}
                            onChange={(e) => setEditStaffForm({ ...editStaffForm, shiftStart: e.target.value })}
                            className="w-full h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-sm font-mono text-on-surface"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                            Shift End Time
                          </label>
                          <input
                            type="time"
                            value={editStaffForm.shiftEnd}
                            onChange={(e) => setEditStaffForm({ ...editStaffForm, shiftEnd: e.target.value })}
                            className="w-full h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-sm font-mono text-on-surface"
                          />
                        </div>
                      </div>
                    )}

                    {editStaffForm.scheduleMode === 'EXPIRING' && (
                      <div className="pt-2">
                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1">
                          Expiry Date
                        </label>
                        <input
                          type="date"
                          value={editStaffForm.expiresAt}
                          onChange={(e) => setEditStaffForm({ ...editStaffForm, expiresAt: e.target.value })}
                          className="w-full h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-sm text-on-surface"
                        />
                      </div>
                    )}
                  </div>

                  {/* Permissions */}
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                      Permissions
                    </label>
                    <div className="space-y-1.5 bg-surface-container-low p-3 rounded-xl border border-outline-variant/30">
                      {[
                        { key: 'COLLECT_PAYMENTS', label: 'Collect Cash / UPI & Generate Receipts' },
                        { key: 'RECORD_OFFLINE', label: 'Record Cash Ledger Entries' },
                        { key: 'ADJUST_FEES', label: 'Fee Structure Adjustments' },
                        { key: 'WAIVE_FINES', label: 'Late Fine Waivers' },
                        { key: 'VIEW_STUDENTS', label: 'View Student Master Directory' }
                      ].map((item) => {
                        const checked = editStaffForm.permissions.includes(item.key);
                        return (
                          <label key={item.key} className="flex items-center gap-2.5 cursor-pointer p-1 rounded hover:bg-surface-container/50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditStaffForm({ ...editStaffForm, permissions: [...editStaffForm.permissions, item.key] });
                                } else {
                                  setEditStaffForm({ ...editStaffForm, permissions: editStaffForm.permissions.filter((p) => p !== item.key) });
                                }
                              }}
                              className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                            />
                            <span className="text-xs font-medium text-on-surface">{item.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Reset Password (Leave blank to keep unchanged)
                    </label>
                    <input
                      type="text"
                      placeholder="Enter new password if resetting..."
                      value={editStaffForm.password}
                      onChange={(e) => setEditStaffForm({ ...editStaffForm, password: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-sm font-mono focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                    <button
                      type="button"
                      onClick={() => setEditingStaff(null)}
                      className="h-10 px-4 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updatingStaff}
                      className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-on-primary text-sm font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer active:scale-95"
                    >
                      {updatingStaff ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">save</span>
                          <span>Update Account Settings</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: GITHUB-STYLE AUDIT LOGS & ACTIVITY TRAIL (ADMIN-ONLY) */}
      {activeTab === 'audit' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Card */}
          <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 flex items-center justify-between flex-wrap gap-4 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[24px]">history_toggle_off</span>
                <h3 className="text-lg font-bold text-on-surface">Institutional Audit Logs &amp; Activity Stream</h3>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-mono font-semibold">
                  ENTERPRISE AUDIT
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                GitHub-style continuous activity stream. Every cashier payment, fee waiver, student record modification, and login event is stamped with exact author, role, timestamp, and state diff.
              </p>
            </div>

            <button
              onClick={() => loadAuditLogs(auditPage)}
              disabled={auditLoading}
              className="h-10 px-4 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl font-semibold text-sm flex items-center gap-2 shadow-2xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[18px] ${auditLoading ? 'animate-spin' : ''}`}>
                refresh
              </span>
              <span>Refresh Trail</span>
            </button>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-2xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Actions Today</span>
                <span className="material-symbols-outlined text-primary text-[20px]">insights</span>
              </div>
              <div className="text-2xl font-bold font-mono text-on-surface mt-2">
                {auditStats?.todayCount ?? '...'}
              </div>
              <div className="text-[11px] text-on-surface-variant mt-0.5">Recorded across all operators</div>
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-2xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-xs font-semibold uppercase tracking-wider">Staff / Cashier Actions</span>
                <span className="material-symbols-outlined text-emerald-600 text-[20px]">point_of_sale</span>
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">
                {auditStats?.staffCountToday ?? '...'}
              </div>
              <div className="text-[11px] text-on-surface-variant mt-0.5">Counter collections &amp; inquiries</div>
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-2xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-xs font-semibold uppercase tracking-wider">Admin Adjustments</span>
                <span className="material-symbols-outlined text-purple-600 text-[20px]">admin_panel_settings</span>
              </div>
              <div className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400 mt-2">
                {auditStats?.adminCountToday ?? '...'}
              </div>
              <div className="text-[11px] text-on-surface-variant mt-0.5">Direct system &amp; ledger changes</div>
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-2xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-xs font-semibold uppercase tracking-wider">Payment Ledger Events</span>
                <span className="material-symbols-outlined text-secondary text-[20px]">account_balance_wallet</span>
              </div>
              <div className="text-2xl font-bold font-mono text-secondary mt-2">
                {auditStats?.paymentActionsToday ?? '...'}
              </div>
              <div className="text-[11px] text-on-surface-variant mt-0.5">Receipts &amp; fee structure events</div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 flex items-center justify-between flex-wrap gap-3 shadow-sm">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <span className="material-symbols-outlined text-on-surface-variant text-[20px]">search</span>
              <input
                type="text"
                placeholder="Search action, entity ID, student, reason or receipt..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') loadAuditLogs(1);
                }}
                className="w-full h-9 bg-transparent border-none text-sm text-on-surface placeholder:text-outline focus:outline-none"
              />
              {auditSearch && (
                <button
                  onClick={() => {
                    setAuditSearch('');
                    setTimeout(() => loadAuditLogs(1), 50);
                  }}
                  className="text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-on-surface-variant">Action:</span>
              <select
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
                className="h-9 px-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold text-on-surface focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="ALL">All Event Types</option>
                <option value="PAYMENT_RECORDED_OFFLINE">Offline Payments</option>
                <option value="FINE_WAIVED">Fine Waivers</option>
                <option value="FEE_ADJUSTED">Fee Adjustments</option>
                <option value="CREATE_STAFF_USER">Staff Creation</option>
                <option value="UPDATE_STAFF_ACCESS">Staff Shift Updates</option>
                <option value="USER_LOGIN">User Logins</option>
              </select>

              <span className="text-xs font-semibold text-on-surface-variant ml-1">Role:</span>
              <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-outline-variant/30">
                {['ALL', 'CASHIER', 'STAFF', 'ADMIN', 'SYSTEM'].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setAuditRole(r);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      auditRole === r
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <button
                onClick={() => loadAuditLogs(1)}
                className="h-9 px-3 bg-primary text-on-primary rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer active:scale-95"
              >
                <span>Filter</span>
              </button>
            </div>
          </div>

          {/* GitHub-Style Activity Stream Timeline */}
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 shadow-sm">
            {auditLoading ? (
              <div className="py-16 text-center text-on-surface-variant">
                <span className="material-symbols-outlined animate-spin text-[32px] text-primary block mx-auto mb-2">
                  progress_activity
                </span>
                <p className="font-semibold text-sm">Querying verified audit records...</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="py-16 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[42px] text-outline block mb-2">find_in_page</span>
                <h4 className="font-bold text-on-surface">No audit events match current filters</h4>
                <p className="text-xs text-on-surface-variant mt-1">
                  Try clearing the search query or changing the actor role filter.
                </p>
              </div>
            ) : (
              <div className="relative pl-6 space-y-8 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-outline-variant/30">
                {auditLogs.map((log: any) => {
                  const isExpanded = expandedLogId === log.id;
                  const role = log.actorRole || 'SYSTEM';

                  // Dynamic icon & coloring based on action
                  let actionIcon = 'history';
                  let actionColor = 'text-primary bg-primary/10 border-primary/20';

                  if (log.action.includes('PAYMENT')) {
                    actionIcon = 'point_of_sale';
                    actionColor = 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30 dark:text-emerald-300';
                  } else if (log.action.includes('FINE') || log.action.includes('WAIVE')) {
                    actionIcon = 'receipt_long';
                    actionColor = 'text-amber-700 bg-amber-500/10 border-amber-500/30 dark:text-amber-300';
                  } else if (log.action.includes('USER') || log.action.includes('STAFF')) {
                    actionIcon = 'manage_accounts';
                    actionColor = 'text-blue-700 bg-blue-500/10 border-blue-500/30 dark:text-blue-300';
                  } else if (log.action.includes('LOGIN')) {
                    actionIcon = 'login';
                    actionColor = 'text-slate-700 bg-slate-500/10 border-slate-500/30 dark:text-slate-300';
                  } else if (log.action.includes('SYNC')) {
                    actionIcon = 'sync';
                    actionColor = 'text-indigo-700 bg-indigo-500/10 border-indigo-500/30 dark:text-indigo-300';
                  }

                  const hasDiff = (log.before && Object.keys(log.before).length > 0) ||
                                  (log.after && Object.keys(log.after).length > 0);

                  return (
                    <div key={log.id} className="relative group">
                      {/* Timeline node */}
                      <div className="absolute -left-[30px] top-1.5 w-4 h-4 rounded-full bg-surface-container-lowest border-2 border-primary flex items-center justify-center shadow-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      </div>

                      {/* Event Card */}
                      <div className="bg-surface-container-low/60 hover:bg-surface-container-low transition-all rounded-xl border border-outline-variant/30 p-4 shadow-2xs">
                        {/* Event Header */}
                        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-outline-variant/15">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Action Pill */}
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${actionColor}`}>
                              <span className="material-symbols-outlined text-[14px]">{actionIcon}</span>
                              <span>{log.action}</span>
                            </span>

                            {/* Entity Type */}
                            <span className="text-xs font-mono text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant/20">
                              {log.entityType} {log.entityId ? `#${log.entityId.slice(-6)}` : ''}
                            </span>
                          </div>

                          {/* Timestamp */}
                          <div className="text-xs font-mono text-on-surface-variant flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                            <span>{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Actor & Description Body */}
                        <div className="py-2.5 flex items-start justify-between flex-wrap gap-3">
                          <div className="space-y-1">
                            {/* Actor Details */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-on-surface">
                                {log.actor?.name || 'System Operator / Autonomous'}
                              </span>
                              <span
                                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full border ${
                                  role === 'ADMIN'
                                    ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
                                    : role === 'CASHIER'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                    : role === 'STAFF'
                                    ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                                    : 'bg-surface-container text-on-surface-variant border-outline-variant/30'
                                }`}
                              >
                                {role}
                              </span>
                              {log.actor?.email && (
                                <span className="text-xs text-on-surface-variant font-mono">({log.actor.email})</span>
                              )}
                            </div>

                            {/* Human Reason / Note */}
                            {log.reason && (
                              <p className="text-xs text-on-surface-variant italic">
                                Note / Reason: "{log.reason}"
                              </p>
                            )}
                          </div>

                          {/* Inspect Diff Button */}
                          {hasDiff && (
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 cursor-pointer bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/20"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                {isExpanded ? 'expand_less' : 'difference'}
                              </span>
                              <span>{isExpanded ? 'Hide Changes' : 'Inspect Changes (Diff)'}</span>
                            </button>
                          )}
                        </div>

                        {/* Expandable GitHub-Style Diff Inspector */}
                        {isExpanded && hasDiff && (
                          <div className="mt-3 pt-3 border-t border-outline-variant/20 animate-fade-in space-y-2">
                            <div className="text-xs font-bold text-on-surface flex items-center gap-1.5 uppercase tracking-wider">
                              <span className="material-symbols-outlined text-primary text-[16px]">compare_arrows</span>
                              <span>State Modification Snapshot</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                              {/* Before Column */}
                              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-900 dark:text-red-300">
                                <div className="font-bold flex items-center gap-1 mb-1 text-[11px] text-red-700 dark:text-red-400">
                                  <span>- BEFORE</span>
                                </div>
                                <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed">
                                  {log.before ? JSON.stringify(log.before, null, 2) : 'No prior state recorded'}
                                </pre>
                              </div>

                              {/* After Column */}
                              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-300">
                                <div className="font-bold flex items-center gap-1 mb-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                                  <span>+ AFTER</span>
                                </div>
                                <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed">
                                  {log.after ? JSON.stringify(log.after, null, 2) : 'No after state recorded'}
                                </pre>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {auditPagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-6 border-t border-outline-variant/20 mt-6 flex-wrap gap-3">
                <div className="text-xs text-on-surface-variant font-mono">
                  Showing page {auditPagination.page} of {auditPagination.totalPages} ({auditPagination.total} total audit records)
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadAuditLogs(auditPage - 1)}
                    disabled={auditPage <= 1 || auditLoading}
                    className="h-8 px-3 rounded-lg border border-outline-variant/30 text-xs font-semibold text-on-surface hover:bg-surface-container disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>

                  <button
                    onClick={() => loadAuditLogs(auditPage + 1)}
                    disabled={auditPage >= auditPagination.totalPages || auditLoading}
                    className="h-8 px-3 rounded-lg border border-outline-variant/30 text-xs font-semibold text-on-surface hover:bg-surface-container disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: STAFF OPERATING GUIDE & FIELD MANUAL */}
      {activeTab === 'guide' && <StaffUserGuide />}
    </div>
  );
};

