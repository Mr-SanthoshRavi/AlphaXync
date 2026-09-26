import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../lib/api';

export interface AlphaSheetStudioProps {
  onOpenStudentDrawer?: (student: any) => void;
  onOpenPaymentModal?: (student: any) => void;
  cashierMode?: boolean;
}

interface SheetRow {
  id: string;
  externalStudentId: string;
  name: string;
  fatherName: string;
  motherName: string;
  whatsappNumber: string;
  course: string;
  department: string;
  year: string;
  section: string;
  status: string;
  validationStatus: string;
  sourceProvider: string;
  sourceSheetId?: string;
  fee: {
    id: string | null;
    feeAccountId: string | null;
    total: number;
    paid: number;
    balance: number;
    dueDate?: string;
    fine?: number;
    status: string;
  };
  isNew?: boolean;
  isModified?: boolean;
}

interface PresetSettings {
  academicYear: string;
  defaultFee: number;
  dueDateDays: number;
  departments: string[];
  courses: string[];
}

const DEFAULT_PRESETS: PresetSettings = {
  academicYear: '2025-2026',
  defaultFee: 65000,
  dueDateDays: 30,
  departments: [
    'Computer Science (CSE)',
    'Information Technology (IT)',
    'Electronics & Comm (ECE)',
    'Electrical & Electronics (EEE)',
    'Mechanical Engineering (MECH)',
    'Civil Engineering',
    'Artificial Intelligence & DS (AI&DS)',
    'Business Administration (MBA)',
    'Computer Applications (MCA)'
  ],
  courses: ['B.Tech', 'B.E.', 'M.Tech', 'B.Sc', 'B.Com', 'BBA', 'MBA', 'MCA']
};

export const AlphaSheetStudio: React.FC<AlphaSheetStudioProps> = ({
  onOpenStudentDrawer
}) => {
  // Master data & State
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');

  // Filters
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'native_sheet' | 'google_sheets' | 'excel_import'>('all');
  const [columnView, setColumnView] = useState<'master' | 'academic' | 'finance' | 'contact'>('master');
  const [paymentFilter, setPaymentFilter] = useState('');

  // Row selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showBatchFillModal, setShowBatchFillModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // Presets loaded from localStorage
  const [presets, setPresets] = useState<PresetSettings>(() => {
    try {
      const saved = localStorage.getItem('alphasheet_presets');
      if (saved) return { ...DEFAULT_PRESETS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_PRESETS;
  });

  const savePresets = (newPresets: PresetSettings) => {
    setPresets(newPresets);
    try {
      localStorage.setItem('alphasheet_presets', JSON.stringify(newPresets));
    } catch {}
  };

  // Pending updates queue for debounced auto-save
  const pendingUpdatesRef = useRef<Map<string, any>>(new Map());
  const debounceTimerRef = useRef<any>(null);

  // Load students from backend
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getStudents({
        search: search.trim() || undefined,
        paymentStatus: paymentFilter || undefined,
        sourceProvider: sourceFilter !== 'all' ? sourceFilter : undefined,
        limit: 200,
        page: 1
      });

      const formatted: SheetRow[] = (res.students || []).map((s: any) => ({
        id: s.id,
        externalStudentId: s.externalStudentId || '',
        name: s.name || '',
        fatherName: s.fatherName || '',
        motherName: s.motherName || '',
        whatsappNumber: s.whatsappNumber || '',
        course: s.course || '',
        department: s.department || '',
        year: s.year || '1',
        section: s.section || 'A',
        status: s.status || 'ACTIVE',
        validationStatus: s.validationStatus || 'VALID',
        sourceProvider: s.sourceProvider || 'native_sheet',
        sourceSheetId: s.sourceSheetId || 'AlphaSheet',
        fee: {
          id: s.fee?.id || null,
          feeAccountId: s.fee?.feeAccountId || null,
          total: Number(s.fee?.total) || 0,
          paid: Number(s.fee?.paid) || 0,
          balance: Number(s.fee?.balance) || 0,
          dueDate: s.fee?.dueDate ? s.fee.dueDate.split('T')[0] : '',
          fine: Number(s.fee?.fine) || 0,
          status: s.fee?.status || 'PENDING'
        }
      }));

      setRows(formatted);
      setSyncStatus('saved');
    } catch (err: any) {
      console.error('Failed to load AlphaSheet data:', err);
      setError(err.message || 'Failed to connect to AlphaSheet backend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, sourceFilter, paymentFilter]);

  // Debounced cloud save
  const triggerDebouncedSave = () => {
    setSyncStatus('saving');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      if (pendingUpdatesRef.current.size === 0) {
        setSyncStatus('saved');
        return;
      }

      const updates = Array.from(pendingUpdatesRef.current.values());
      pendingUpdatesRef.current.clear();

      try {
        await api.batchSaveStudents(updates);
        setSyncStatus('saved');
        // Clear modified flags on rows
        setRows((prev) =>
          prev.map((r) => (updates.some((u) => u.id === r.id) ? { ...r, isModified: false } : r))
        );
      } catch (err) {
        console.error('Auto-save error:', err);
        setSyncStatus('error');
      }
    }, 650);
  };

  // Modify cell value
  const handleCellChange = (id: string, field: string, value: any) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;

        const updated = { ...row, isModified: true };

        if (field.startsWith('fee.')) {
          const feeField = field.split('.')[1];
          const newFee = { ...row.fee, [feeField]: value };
          if (feeField === 'total') {
            const tot = Math.max(0, Number(value) || 0);
            newFee.total = tot;
            newFee.balance = Math.max(0, tot - newFee.paid);
            newFee.status = newFee.balance === 0 ? 'PAID' : newFee.paid > 0 ? 'PARTIAL' : 'PENDING';
          }
          updated.fee = newFee;
        } else {
          (updated as any)[field] = value;
          if (field === 'whatsappNumber') {
            const digits = String(value).replace(/[^0-9]/g, '');
            updated.validationStatus = digits.length >= 10 ? 'VALID' : 'INVALID';
          }
        }

        // Queue update
        const existingUpdate = pendingUpdatesRef.current.get(id) || { id };
        if (field.startsWith('fee.')) {
          const feeField = field.split('.')[1];
          if (feeField === 'total') existingUpdate.totalFee = Number(value) || 0;
          if (feeField === 'dueDate') existingUpdate.dueDate = value;
        } else {
          existingUpdate[field] = value;
        }
        pendingUpdatesRef.current.set(id, existingUpdate);

        return updated;
      })
    );

    triggerDebouncedSave();
  };

  // Add New Row
  const handleAddNewRow = async () => {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const defaultRoll = `REG-${new Date().getFullYear().toString().slice(-2)}${randomSuffix}`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (presets.dueDateDays || 30));
    const dueDateStr = dueDate.toISOString().split('T')[0];

    try {
      setSyncStatus('saving');
      const res = await api.createStudent({
        externalStudentId: defaultRoll,
        name: 'New Student',
        course: presets.courses[0] || 'B.Tech',
        department: presets.departments[0] || 'Computer Science (CSE)',
        year: '1',
        section: 'A',
        academicYear: presets.academicYear,
        totalFee: presets.defaultFee,
        dueDate: dueDateStr
      });

      const s = res.student;
      const newRow: SheetRow = {
        id: s.id,
        externalStudentId: s.externalStudentId,
        name: s.name,
        fatherName: s.fatherName || '',
        motherName: s.motherName || '',
        whatsappNumber: s.whatsappNumber || '',
        course: s.course || presets.courses[0] || 'B.Tech',
        department: s.department || presets.departments[0] || 'Computer Science',
        year: s.year || '1',
        section: s.section || 'A',
        status: s.status || 'ACTIVE',
        validationStatus: s.validationStatus || 'VALID',
        sourceProvider: s.sourceProvider || 'native_sheet',
        sourceSheetId: 'AlphaSheet_Studio',
        fee: {
          id: s.fee?.id || null,
          feeAccountId: s.fee?.feeAccountId || null,
          total: Number(s.fee?.total) || presets.defaultFee,
          paid: 0,
          balance: Number(s.fee?.total) || presets.defaultFee,
          dueDate: dueDateStr,
          status: 'PENDING'
        },
        isNew: true
      };

      setRows((prev) => [newRow, ...prev]);
      setSyncStatus('saved');
    } catch (err: any) {
      console.error('Failed to create student row:', err);
      alert(err.message || 'Failed to add student row');
      setSyncStatus('error');
    }
  };

  // Delete Row
  const handleDeleteRow = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete student "${name}"? This removes the student and their ledger record.`)) {
      return;
    }

    try {
      await api.deleteStudent(id, true);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err: any) {
      alert(err.message || 'Failed to delete student');
    }
  };

  // Batch Delete Selected
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.size} selected student record(s)?`)) {
      return;
    }

    setSyncStatus('saving');
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) => api.deleteStudent(id, true)));
      setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
      setSyncStatus('saved');
    } catch (err: any) {
      alert(err.message || 'Failed to delete selected rows');
      setSyncStatus('error');
    }
  };

  // Export handlers
  const handleExport = async (format: 'xlsx' | 'csv') => {
    setShowExportMenu(false);
    setExportLoading(true);
    try {
      await api.exportStudents({
        format,
        sourceProvider: sourceFilter !== 'all' ? sourceFilter : undefined,
        search: search.trim() || undefined,
        paymentStatus: paymentFilter || undefined
      });
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  // Row selection helpers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Summary statistics
  const stats = useMemo(() => {
    const total = rows.length;
    const totalFees = rows.reduce((acc, r) => acc + (r.fee?.total || 0), 0);
    const totalCollected = rows.reduce((acc, r) => acc + (r.fee?.paid || 0), 0);
    const totalBalance = rows.reduce((acc, r) => acc + (r.fee?.balance || 0), 0);
    const nativeCount = rows.filter((r) => r.sourceProvider === 'native_sheet').length;
    const googleCount = rows.filter((r) => r.sourceProvider === 'google_sheets').length;
    return { total, totalFees, totalCollected, totalBalance, nativeCount, googleCount };
  }, [rows]);

  return (
    <div className="flex flex-col w-full bg-surface min-h-[calc(100vh-140px)] select-none">
      {/* Top Banner Toolbar */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-t-lg p-3 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Brand & Engine Badge */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">grid_on</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-sm text-[17px] font-bold text-on-surface tracking-tight">
                  AlphaSheet Studio
                </h2>
                <span className="font-data-mono text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold border border-primary/20">
                  NATIVE SPREADSHEET ENGINE
                </span>
                {/* Cloud Save Pill */}
                <div className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">
                  {syncStatus === 'saving' && (
                    <>
                      <span className="material-symbols-outlined text-[13px] animate-spin text-primary">sync</span>
                      <span>Saving changes...</span>
                    </>
                  )}
                  {syncStatus === 'saved' && (
                    <>
                      <span className="material-symbols-outlined text-[13px] text-secondary">cloud_done</span>
                      <span className="text-secondary font-semibold">All changes saved</span>
                    </>
                  )}
                  {syncStatus === 'error' && (
                    <>
                      <span className="material-symbols-outlined text-[13px] text-error">cloud_off</span>
                      <span className="text-error font-semibold">Save failed - retry</span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Full-featured institutional roster ledger with isolated multi-source architecture & instant cloud sync.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Add Row Button */}
            <button
              onClick={handleAddNewRow}
              className="h-8 px-3 rounded bg-primary text-on-primary hover:bg-primary/90 text-label-sm font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>Add Row</span>
            </button>

            {/* Import Button */}
            <button
              onClick={() => setShowImportModal(true)}
              className="h-8 px-3 rounded bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface text-label-sm font-medium flex items-center gap-1.5 transition-all"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">upload_file</span>
              <span>Import Excel / CSV</span>
            </button>

            {/* Export Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu((p) => !p)}
                disabled={exportLoading}
                className="h-8 px-3 rounded bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface text-label-sm font-medium flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px] text-secondary">
                  {exportLoading ? 'hourglass_top' : 'download'}
                </span>
                <span>{exportLoading ? 'Exporting...' : 'Export'}</span>
                <span className="material-symbols-outlined text-[14px]">expand_more</span>
              </button>

              {showExportMenu && (
                <div className="absolute right-0 top-9 w-48 bg-surface-container-lowest border border-outline-variant/30 rounded-lg shadow-xl z-50 py-1 font-body-sm text-on-surface animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => handleExport('xlsx')}
                    className="w-full text-left px-3 py-2 hover:bg-surface-container flex items-center gap-2 text-xs"
                  >
                    <span className="material-symbols-outlined text-[16px] text-secondary">table_view</span>
                    <div>
                      <div className="font-semibold">Export as Excel</div>
                      <div className="text-[10px] text-on-surface-variant">Microsoft Excel (.xlsx)</div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full text-left px-3 py-2 hover:bg-surface-container flex items-center gap-2 text-xs border-t border-outline-variant/20"
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary">description</span>
                    <div>
                      <div className="font-semibold">Export as CSV</div>
                      <div className="text-[10px] text-on-surface-variant">Standard Comma Separated (.csv)</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Presets Settings Button */}
            <button
              onClick={() => setShowPresetModal(true)}
              className="h-8 px-2.5 rounded bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface text-label-sm flex items-center gap-1 transition-all"
              title="Sheet Presets & Default Configurations"
            >
              <span className="material-symbols-outlined text-[16px] text-tertiary">tune</span>
              <span className="hidden sm:inline">Presets</span>
            </button>

            {/* Reload Data */}
            <button
              onClick={loadData}
              disabled={loading}
              className="h-8 w-8 rounded bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface flex items-center justify-center transition-all disabled:opacity-50"
              title="Reload Sheet Data"
            >
              <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin text-primary' : ''}`}>
                refresh
              </span>
            </button>
          </div>
        </div>

        {/* Sub-toolbar: Filters, Column Views, and Batch Selection Actions */}
        <div className="flex items-center justify-between flex-wrap gap-2.5 pt-2 border-t border-outline-variant/20 text-xs">
          {/* Left: View Modes & Source Filter Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Source Provider Tabs */}
            <div className="flex items-center bg-surface-container p-0.5 rounded border border-outline-variant/30">
              <button
                onClick={() => setSourceFilter('all')}
                className={`px-2.5 py-1 rounded text-label-sm font-medium transition-all ${
                  sourceFilter === 'all'
                    ? 'bg-surface-container-lowest text-primary shadow-xs font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                All Sources ({stats.total})
              </button>
              <button
                onClick={() => setSourceFilter('native_sheet')}
                className={`px-2.5 py-1 rounded text-label-sm font-medium transition-all ${
                  sourceFilter === 'native_sheet'
                    ? 'bg-surface-container-lowest text-primary shadow-xs font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                AlphaSheet Native ({stats.nativeCount})
              </button>
              <button
                onClick={() => setSourceFilter('google_sheets')}
                className={`px-2.5 py-1 rounded text-label-sm font-medium transition-all ${
                  sourceFilter === 'google_sheets'
                    ? 'bg-surface-container-lowest text-primary shadow-xs font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Google Sheets ({stats.googleCount})
              </button>
            </div>

            {/* Column Presets */}
            <div className="flex items-center gap-1 text-on-surface-variant ml-1">
              <span className="text-[11px] font-medium text-outline">View:</span>
              {(['master', 'academic', 'finance', 'contact'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setColumnView(view)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize border transition-all ${
                    columnView === view
                      ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                      : 'border-transparent text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Search, Payment Status, and Batch Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Batch Actions when rows are selected */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded border border-primary/20 animate-in fade-in">
                <span className="font-semibold text-[11px]">{selectedIds.size} row(s) selected</span>
                <button
                  onClick={() => setShowBatchFillModal(true)}
                  className="px-2 py-0.5 rounded bg-primary text-on-primary text-[10px] font-semibold hover:bg-primary/90"
                >
                  Quick Fill
                </button>
                <button
                  onClick={handleBatchDelete}
                  className="px-2 py-0.5 rounded bg-error text-on-error text-[10px] font-semibold hover:bg-error/90"
                >
                  Delete Selected
                </button>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2 top-1.5 text-outline text-[14px]">search</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roll, name, phone..."
                className="h-7 pl-6 pr-2 bg-surface-container border border-outline-variant/30 rounded text-[11px] text-on-surface focus:outline-none focus:border-primary w-48"
              />
            </div>

            {/* Payment Filter */}
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="h-7 px-2 bg-surface-container border border-outline-variant/30 rounded text-[11px] text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="">All Payment States</option>
              <option value="PAID">PAID</option>
              <option value="PARTIAL">PARTIAL</option>
              <option value="PENDING">PENDING</option>
            </select>
          </div>
        </div>

        {/* Ledger Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-outline-variant/15 text-xs">
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-surface-container/60 rounded">
            <span className="text-on-surface-variant text-[11px]">Total Enrolled:</span>
            <span className="font-data-mono font-semibold text-on-surface">{stats.total}</span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-surface-container/60 rounded">
            <span className="text-on-surface-variant text-[11px]">Total Fee Pool:</span>
            <span className="font-data-mono font-semibold text-on-surface">₹{stats.totalFees.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-surface-container/60 rounded">
            <span className="text-on-surface-variant text-[11px]">Total Verified:</span>
            <span className="font-data-mono font-semibold text-secondary">₹{stats.totalCollected.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-surface-container/60 rounded">
            <span className="text-on-surface-variant text-[11px]">Outstanding Balance:</span>
            <span className="font-data-mono font-semibold text-error">₹{stats.totalBalance.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* Spreadsheet Main Grid Area */}
      <div className="bg-surface-container-lowest border-x border-b border-outline-variant/30 rounded-b-lg overflow-x-auto shadow-sm min-h-[500px]">
        <table className="w-full text-left border-collapse text-xs">
          {/* Sticky Header */}
          <thead className="sticky top-0 z-30 bg-surface-container-low border-b border-outline-variant/30 shadow-xs">
            <tr className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider select-none">
              {/* Checkbox */}
              <th className="py-2.5 px-3 w-10 text-center border-r border-outline-variant/20">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selectedIds.size === rows.length}
                  onChange={handleSelectAll}
                  className="rounded border-outline-variant text-primary focus:ring-0 cursor-pointer"
                />
              </th>

              {/* Row Number */}
              <th className="py-2.5 px-2.5 w-12 text-center border-r border-outline-variant/20 font-data-mono text-[10px] text-outline">
                #
              </th>

              {/* Source Provider Badge */}
              <th className="py-2.5 px-3 w-24 text-center border-r border-outline-variant/20">
                Source
              </th>

              {/* Roll / Register No */}
              <th className="py-2.5 px-3 w-32 border-r border-outline-variant/20">
                Roll / Reg No
              </th>

              {/* Student Name */}
              <th className="py-2.5 px-3 min-w-[160px] border-r border-outline-variant/20">
                Student Name
              </th>

              {/* WhatsApp Contact */}
              {(columnView === 'master' || columnView === 'contact') && (
                <th className="py-2.5 px-3 min-w-[150px] border-r border-outline-variant/20">
                  WhatsApp Number
                </th>
              )}

              {/* Course */}
              {(columnView === 'master' || columnView === 'academic') && (
                <th className="py-2.5 px-3 min-w-[120px] border-r border-outline-variant/20">
                  Course
                </th>
              )}

              {/* Department */}
              {(columnView === 'master' || columnView === 'academic') && (
                <th className="py-2.5 px-3 min-w-[180px] border-r border-outline-variant/20">
                  Department
                </th>
              )}

              {/* Year & Section */}
              {(columnView === 'master' || columnView === 'academic') && (
                <>
                  <th className="py-2.5 px-2.5 w-16 text-center border-r border-outline-variant/20">
                    Year
                  </th>
                  <th className="py-2.5 px-2.5 w-16 text-center border-r border-outline-variant/20">
                    Sec
                  </th>
                </>
              )}

              {/* Father Name */}
              {(columnView === 'master' || columnView === 'contact') && (
                <th className="py-2.5 px-3 min-w-[140px] border-r border-outline-variant/20">
                  Father / Guardian
                </th>
              )}

              {/* Total Fee */}
              {(columnView === 'master' || columnView === 'finance') && (
                <th className="py-2.5 px-3 w-28 text-right border-r border-outline-variant/20">
                  Total Fee (₹)
                </th>
              )}

              {/* Paid Amount */}
              {(columnView === 'master' || columnView === 'finance') && (
                <th className="py-2.5 px-3 w-28 text-right border-r border-outline-variant/20">
                  Paid (₹)
                </th>
              )}

              {/* Balance */}
              {(columnView === 'master' || columnView === 'finance') && (
                <th className="py-2.5 px-3 w-28 text-right border-r border-outline-variant/20">
                  Balance (₹)
                </th>
              )}

              {/* Due Date */}
              {(columnView === 'master' || columnView === 'finance') && (
                <th className="py-2.5 px-3 w-32 border-r border-outline-variant/20">
                  Due Date
                </th>
              )}

              {/* Payment Status */}
              <th className="py-2.5 px-3 w-28 text-center border-r border-outline-variant/20">
                Fee Status
              </th>

              {/* Row Action Controls */}
              <th className="py-2.5 px-2.5 w-16 text-center">
                Action
              </th>
            </tr>
          </thead>

          {/* Grid Body */}
          <tbody className="divide-y divide-outline-variant/15 text-body-sm text-on-surface">
            {loading ? (
              <tr>
                <td colSpan={16} className="py-20 text-center text-on-surface-variant">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[28px] animate-spin">
                      progress_activity
                    </span>
                    <span className="font-medium text-on-surface">Loading AlphaSheet ledger matrix...</span>
                    <span className="text-[11px] text-outline">Synchronizing isolated student rosters</span>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={16} className="py-16 text-center text-error">
                  <span className="material-symbols-outlined text-[32px] block mb-1">cloud_off</span>
                  <div className="font-semibold">{error}</div>
                  <button
                    onClick={loadData}
                    className="mt-3 px-3 py-1 rounded bg-error text-on-error text-xs font-semibold hover:bg-error/90"
                  >
                    Retry Connection
                  </button>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={16} className="py-20 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[36px] text-outline block mb-2">grid_off</span>
                  <p className="font-semibold text-on-surface text-[14px]">No student records in this view</p>
                  <p className="text-xs text-outline mt-1 max-w-md mx-auto">
                    Click <strong>Add Row</strong> to create your first native ledger entry, or use{' '}
                    <strong>Import Excel / CSV</strong> to bulk ingest institutional rosters.
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                      onClick={handleAddNewRow}
                      className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90"
                    >
                      + Add New Student Row
                    </button>
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="px-3 py-1.5 rounded bg-surface-container border border-outline-variant/30 text-xs font-medium hover:bg-surface-container-high"
                    >
                      Import Excel / CSV
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const isSelected = selectedIds.has(row.id);

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors hover:bg-surface-container-low/60 group ${
                      isSelected ? 'bg-primary/5' : row.isModified ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-1 px-3 text-center border-r border-outline-variant/15">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleRow(row.id)}
                        className="rounded border-outline-variant text-primary focus:ring-0 cursor-pointer"
                      />
                    </td>

                    {/* Row Index */}
                    <td className="py-1 px-2.5 text-center border-r border-outline-variant/15 font-data-mono text-[11px] text-outline">
                      {idx + 1}
                    </td>

                    {/* Source Provider Tag */}
                    <td className="py-1 px-2 text-center border-r border-outline-variant/15">
                      {row.sourceProvider === 'native_sheet' ? (
                        <span className="font-data-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          NATIVE
                        </span>
                      ) : row.sourceProvider === 'excel_import' ? (
                        <span className="font-data-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          EXCEL
                        </span>
                      ) : (
                        <span className="font-data-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          GSHEET
                        </span>
                      )}
                    </td>

                    {/* Roll / Register No */}
                    <td className="py-1 px-3 border-r border-outline-variant/15 font-data-mono text-[11px] font-semibold text-on-surface">
                      <input
                        type="text"
                        value={row.externalStudentId}
                        onChange={(e) => handleCellChange(row.id, 'externalStudentId', e.target.value)}
                        className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest rounded px-1 font-data-mono"
                        placeholder="Roll No"
                      />
                    </td>

                    {/* Student Name */}
                    <td className="py-1 px-3 border-r border-outline-variant/15 font-medium text-on-surface">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => handleCellChange(row.id, 'name', e.target.value)}
                        className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest rounded px-1 text-on-surface font-semibold"
                        placeholder="Student Full Name"
                      />
                    </td>

                    {/* WhatsApp Number with verification icon */}
                    {(columnView === 'master' || columnView === 'contact') && (
                      <td className="py-1 px-3 border-r border-outline-variant/15 font-data-mono text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              row.validationStatus === 'VALID' && row.whatsappNumber
                                ? 'bg-secondary'
                                : 'bg-error'
                            }`}
                            title={
                              row.validationStatus === 'VALID' && row.whatsappNumber
                                ? 'Valid WhatsApp Number'
                                : 'Invalid or Missing phone number'
                            }
                          />
                          <input
                            type="text"
                            value={row.whatsappNumber}
                            onChange={(e) => handleCellChange(row.id, 'whatsappNumber', e.target.value)}
                            placeholder="+919876543210"
                            className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest rounded px-1 font-data-mono"
                          />
                        </div>
                      </td>
                    )}

                    {/* Course */}
                    {(columnView === 'master' || columnView === 'academic') && (
                      <td className="py-1 px-2 border-r border-outline-variant/15">
                        <input
                          type="text"
                          list="course-presets-list"
                          value={row.course}
                          onChange={(e) => handleCellChange(row.id, 'course', e.target.value)}
                          className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest rounded px-1 text-[11px]"
                          placeholder="Course"
                        />
                      </td>
                    )}

                    {/* Department */}
                    {(columnView === 'master' || columnView === 'academic') && (
                      <td className="py-1 px-2 border-r border-outline-variant/15">
                        <input
                          type="text"
                          list="department-presets-list"
                          value={row.department}
                          onChange={(e) => handleCellChange(row.id, 'department', e.target.value)}
                          className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest rounded px-1 text-[11px]"
                          placeholder="Department"
                        />
                      </td>
                    )}

                    {/* Year & Section */}
                    {(columnView === 'master' || columnView === 'academic') && (
                      <>
                        <td className="py-1 px-2 border-r border-outline-variant/15 text-center">
                          <input
                            type="text"
                            value={row.year}
                            onChange={(e) => handleCellChange(row.id, 'year', e.target.value)}
                            className="w-full text-center bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest rounded px-1 text-[11px]"
                          />
                        </td>
                        <td className="py-1 px-2 border-r border-outline-variant/15 text-center">
                          <input
                            type="text"
                            value={row.section}
                            onChange={(e) => handleCellChange(row.id, 'section', e.target.value.toUpperCase())}
                            className="w-full text-center bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest rounded px-1 text-[11px] font-bold"
                          />
                        </td>
                      </>
                    )}

                    {/* Father Name */}
                    {(columnView === 'master' || columnView === 'contact') && (
                      <td className="py-1 px-3 border-r border-outline-variant/15">
                        <input
                          type="text"
                          value={row.fatherName}
                          onChange={(e) => handleCellChange(row.id, 'fatherName', e.target.value)}
                          className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest rounded px-1 text-[11px]"
                          placeholder="Father Name"
                        />
                      </td>
                    )}

                    {/* Total Fee (Editable) */}
                    {(columnView === 'master' || columnView === 'finance') && (
                      <td className="py-1 px-3 border-r border-outline-variant/15 text-right font-data-mono font-medium">
                        <input
                          type="number"
                          value={row.fee?.total || 0}
                          onChange={(e) => handleCellChange(row.id, 'fee.total', e.target.value)}
                          className="w-full text-right bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest rounded px-1 font-data-mono font-semibold"
                        />
                      </td>
                    )}

                    {/* Paid (Read-only ledger value) */}
                    {(columnView === 'master' || columnView === 'finance') && (
                      <td className="py-1 px-3 border-r border-outline-variant/15 text-right font-data-mono text-secondary font-semibold">
                        ₹{(row.fee?.paid || 0).toLocaleString('en-IN')}
                      </td>
                    )}

                    {/* Balance */}
                    {(columnView === 'master' || columnView === 'finance') && (
                      <td className="py-1 px-3 border-r border-outline-variant/15 text-right font-data-mono font-bold text-on-surface">
                        <span className={row.fee?.balance > 0 ? 'text-error' : 'text-secondary'}>
                          ₹{(row.fee?.balance || 0).toLocaleString('en-IN')}
                        </span>
                      </td>
                    )}

                    {/* Due Date */}
                    {(columnView === 'master' || columnView === 'finance') && (
                      <td className="py-1 px-2 border-r border-outline-variant/15 font-data-mono text-[11px]">
                        <input
                          type="date"
                          value={row.fee?.dueDate || ''}
                          onChange={(e) => handleCellChange(row.id, 'fee.dueDate', e.target.value)}
                          className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest rounded px-1 text-[11px] font-data-mono"
                        />
                      </td>
                    )}

                    {/* Fee Status Badge */}
                    <td className="py-1 px-3 border-r border-outline-variant/15 text-center">
                      <span
                        className={`font-data-mono text-[9px] font-bold px-2 py-0.5 rounded-full inline-block ${
                          row.fee?.status === 'PAID'
                            ? 'bg-secondary/15 text-secondary'
                            : row.fee?.status === 'PARTIAL'
                            ? 'bg-tertiary/15 text-tertiary'
                            : 'bg-error/15 text-error'
                        }`}
                      >
                        {row.fee?.status || 'PENDING'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-1 px-2 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        {onOpenStudentDrawer && (
                          <button
                            onClick={() => onOpenStudentDrawer(row)}
                            className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container"
                            title="Open Student Profile Drawer"
                          >
                            <span className="material-symbols-outlined text-[15px]">side_navigation</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteRow(row.id, row.name)}
                          className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-surface-container"
                          title="Delete Row"
                        >
                          <span className="material-symbols-outlined text-[15px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Preset Autocomplete Datalists */}
      <datalist id="course-presets-list">
        {presets.courses.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="department-presets-list">
        {presets.departments.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      {/* MODAL 1: Preset Settings Modal */}
      {showPresetModal && (
        <PresetSettingsModal
          presets={presets}
          onSave={(p) => {
            savePresets(p);
            setShowPresetModal(false);
          }}
          onClose={() => setShowPresetModal(false)}
        />
      )}

      {/* MODAL 2: Excel / CSV Import Modal with preview & mapping */}
      {showImportModal && (
        <ExcelImportModal
          presets={presets}
          onSuccess={() => {
            setShowImportModal(false);
            loadData();
          }}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* MODAL 3: Batch Fill Modal */}
      {showBatchFillModal && (
        <BatchFillModal
          selectedCount={selectedIds.size}
          presets={presets}
          onApply={(changes) => {
            const ids = Array.from(selectedIds);
            ids.forEach((id) => {
              Object.entries(changes).forEach(([k, v]) => {
                if (v !== undefined && v !== '') {
                  handleCellChange(id, k, v);
                }
              });
            });
            setShowBatchFillModal(false);
          }}
          onClose={() => setShowBatchFillModal(false)}
        />
      )}
    </div>
  );
};

// ==========================================
// SUB-COMPONENT: Preset Settings Modal
// ==========================================
interface PresetModalProps {
  presets: PresetSettings;
  onSave: (presets: PresetSettings) => void;
  onClose: () => void;
}

const PresetSettingsModal: React.FC<PresetModalProps> = ({ presets, onSave, onClose }) => {
  const [academicYear, setAcademicYear] = useState(presets.academicYear);
  const [defaultFee, setDefaultFee] = useState(presets.defaultFee);
  const [dueDateDays, setDueDateDays] = useState(presets.dueDateDays);
  const [deptInput, setDeptInput] = useState(presets.departments.join('\n'));
  const [courseInput, setCourseInput] = useState(presets.courses.join('\n'));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const depts = deptInput
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const courses = courseInput
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    onSave({
      academicYear,
      defaultFee: Number(defaultFee) || 0,
      dueDateDays: Number(dueDateDays) || 30,
      departments: depts.length > 0 ? depts : DEFAULT_PRESETS.departments,
      courses: courses.length > 0 ? courses : DEFAULT_PRESETS.courses
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">tune</span>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">AlphaSheet Studio Presets</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-outline hover:text-on-surface">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-on-surface-variant font-medium mb-1">Default Academic Year</label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2025-2026"
                className="w-full h-8 px-2.5 bg-surface-container border border-outline-variant/30 rounded text-on-surface font-data-mono"
              />
            </div>
            <div>
              <label className="block text-on-surface-variant font-medium mb-1">Default Tuition Fee (₹)</label>
              <input
                type="number"
                value={defaultFee}
                onChange={(e) => setDefaultFee(Number(e.target.value))}
                className="w-full h-8 px-2.5 bg-surface-container border border-outline-variant/30 rounded text-on-surface font-data-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-on-surface-variant font-medium mb-1">Default Due Date (Days from Today)</label>
            <input
              type="number"
              value={dueDateDays}
              onChange={(e) => setDueDateDays(Number(e.target.value))}
              className="w-full h-8 px-2.5 bg-surface-container border border-outline-variant/30 rounded text-on-surface font-data-mono"
            />
          </div>

          <div>
            <label className="block text-on-surface-variant font-medium mb-1">
              Preset Courses (One per line)
            </label>
            <textarea
              rows={3}
              value={courseInput}
              onChange={(e) => setCourseInput(e.target.value)}
              className="w-full p-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface font-data-mono text-[11px]"
            />
          </div>

          <div>
            <label className="block text-on-surface-variant font-medium mb-1">
              Preset Departments (One per line)
            </label>
            <textarea
              rows={4}
              value={deptInput}
              onChange={(e) => setDeptInput(e.target.value)}
              className="w-full p-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface font-data-mono text-[11px]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/20 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-surface-container text-on-surface font-medium hover:bg-surface-container-high"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-primary text-on-primary font-semibold hover:bg-primary/90 shadow-sm"
            >
              Save Presets
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// SUB-COMPONENT: Excel / CSV Import Modal
// ==========================================
interface ExcelImportModalProps {
  presets: PresetSettings;
  onSuccess: () => void;
  onClose: () => void;
}

const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ presets, onSuccess, onClose }) => {
  const [step, setStep] = useState<'upload' | 'mapping' | 'importing' | 'completed'>('upload');
  const [filename, setFilename] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [detectedMapping, setDetectedMapping] = useState<Record<string, string>>({});
  const [updateExisting, setUpdateExisting] = useState(true);
  const [academicYear, setAcademicYear] = useState(presets.academicYear);
  const [importSummary, setImportSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download Sample Template
  const handleDownloadTemplate = async () => {
    try {
      await api.downloadImportTemplate('xlsx');
    } catch (err: any) {
      alert(err.message || 'Template download failed');
    }
  };

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFilename(file.name);
    setLoading(true);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64 = evt.target?.result as string;

        const parseRes = await api.parseImportFile(base64);
        setHeaders(parseRes.headers || []);
        setPreviewRows(parseRes.previewRows || []);
        setAllRows(parseRes.allRows || []);
        setDetectedMapping(parseRes.detectedMapping || {});
        setStep('mapping');
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to parse spreadsheet file');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Execute Import
  const handleExecuteImport = async () => {
    if (allRows.length === 0) return;
    setLoading(true);
    setStep('importing');
    setErrorMessage(null);

    try {
      const res = await api.bulkImportStudents({
        rows: allRows,
        academicYear,
        updateExisting,
        columnMapping: detectedMapping,
        defaultFee: presets.defaultFee
      });

      setImportSummary(res.data);
      setStep('completed');
    } catch (err: any) {
      setErrorMessage(err.message || 'Bulk import failed');
      setStep('mapping');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-2xl max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">upload_file</span>
            <div>
              <h3 className="font-headline-sm text-base font-bold text-on-surface">
                Import Roster into AlphaSheet
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                Upload Excel (.xlsx, .xls) or CSV files with auto column mapping & safe ledger creation.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-outline hover:text-on-surface">
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 pr-1 text-xs">
          {errorMessage && (
            <div className="p-3 mb-3 rounded bg-error/10 text-error border border-error/20 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="flex flex-col gap-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-outline-variant/60 hover:border-primary rounded-xl p-8 text-center cursor-pointer bg-surface-container-low/40 hover:bg-surface-container transition-all flex flex-col items-center justify-center gap-2"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[28px]">file_upload</span>
                </div>
                <div className="font-semibold text-on-surface text-[14px]">
                  Click or drag and drop your spreadsheet here
                </div>
                <div className="text-[11px] text-on-surface-variant">
                  Supports Microsoft Excel (.xlsx, .xls) and CSV (.csv)
                </div>
              </div>

              {/* Template download notice */}
              <div className="p-3 rounded bg-surface-container flex items-center justify-between">
                <div>
                  <div className="font-semibold text-on-surface">Need the standard spreadsheet format?</div>
                  <div className="text-[11px] text-on-surface-variant">
                    Download the pre-configured Excel template with sample rows and headers.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3 py-1.5 rounded bg-surface-container-lowest border border-outline-variant/30 text-primary hover:bg-primary/5 font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Sample Template</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Column Mapping & Preview */}
          {step === 'mapping' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between bg-surface-container p-2.5 rounded">
                <span className="font-medium text-on-surface">
                  File: <strong className="font-mono">{filename}</strong> ({allRows.length} total rows)
                </span>
                <button
                  onClick={() => setStep('upload')}
                  className="text-primary text-[11px] font-semibold hover:underline"
                >
                  Change File
                </button>
              </div>

              {/* Config fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-on-surface-variant font-medium mb-1">Target Academic Year</label>
                  <input
                    type="text"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="w-full h-8 px-2.5 bg-surface-container border border-outline-variant/30 rounded text-on-surface font-data-mono"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      className="rounded border-outline-variant text-primary focus:ring-0"
                    />
                    <span className="text-on-surface font-medium text-[11px]">
                      Update existing students if Roll No already exists
                    </span>
                  </label>
                </div>
              </div>

              {/* Detected Mapping Overview */}
              <div>
                <h4 className="font-semibold text-on-surface mb-2">Column Mapping Verification:</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-surface-container-low p-3 rounded border border-outline-variant/20 max-h-36 overflow-y-auto">
                  {headers.map((h) => {
                    const mapped = detectedMapping[h];
                    return (
                      <div key={h} className="flex items-center justify-between text-[11px] p-1 bg-surface-container-lowest rounded border border-outline-variant/20">
                        <span className="font-mono truncate max-w-[100px]" title={h}>
                          {h}
                        </span>
                        {mapped ? (
                          <span className="text-secondary font-semibold flex items-center gap-0.5 text-[10px]">
                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                            <span>{mapped}</span>
                          </span>
                        ) : (
                          <span className="text-outline text-[10px]">unmapped</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Preview table */}
              <div>
                <h4 className="font-semibold text-on-surface mb-1">Preview (First {previewRows.length} rows):</h4>
                <div className="overflow-x-auto border border-outline-variant/20 rounded max-h-40">
                  <table className="w-full text-[10px] text-left">
                    <thead className="bg-surface-container-low text-on-surface-variant uppercase">
                      <tr>
                        {headers.slice(0, 6).map((h) => (
                          <th key={h} className="p-1.5 border-r border-outline-variant/20 font-mono">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/15">
                      {previewRows.slice(0, 5).map((row, i) => (
                        <tr key={i}>
                          {headers.slice(0, 6).map((h) => (
                            <td key={h} className="p-1.5 border-r border-outline-variant/15 font-mono truncate max-w-[120px]">
                              {String(row[h] || '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Importing Spinner */}
          {step === 'importing' && (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
              <span className="material-symbols-outlined text-primary text-[36px] animate-spin">
                sync
              </span>
              <div className="font-semibold text-on-surface text-[14px]">
                Importing {allRows.length} student records...
              </div>
              <div className="text-[11px] text-on-surface-variant max-w-sm">
                Generating unique student IDs, validating WhatsApp contacts, and creating fee ledger accounts.
              </div>
            </div>
          )}

          {/* STEP 4: Completed Summary */}
          {step === 'completed' && importSummary && (
            <div className="py-6 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-secondary/10 text-secondary flex items-center justify-center">
                <span className="material-symbols-outlined text-[32px]">task_alt</span>
              </div>
              <h4 className="font-bold text-on-surface text-base">Import Completed Successfully!</h4>
              <div className="grid grid-cols-3 gap-3 w-full max-w-md my-2">
                <div className="p-3 bg-secondary/10 rounded border border-secondary/20">
                  <div className="text-secondary font-bold text-lg font-mono">{importSummary.added}</div>
                  <div className="text-[11px] text-on-surface-variant">New Students Added</div>
                </div>
                <div className="p-3 bg-primary/10 rounded border border-primary/20">
                  <div className="text-primary font-bold text-lg font-mono">{importSummary.updated}</div>
                  <div className="text-[11px] text-on-surface-variant">Existing Updated</div>
                </div>
                <div className="p-3 bg-surface-container rounded border border-outline-variant/30">
                  <div className="text-outline font-bold text-lg font-mono">{importSummary.skipped}</div>
                  <div className="text-[11px] text-on-surface-variant">Skipped / Duplicates</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/20 mt-4 shrink-0">
          {step === 'completed' ? (
            <button
              onClick={onSuccess}
              className="px-5 py-2 rounded bg-primary text-on-primary font-semibold hover:bg-primary/90 shadow-sm"
            >
              Done & View AlphaSheet
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded bg-surface-container text-on-surface font-medium hover:bg-surface-container-high"
              >
                Cancel
              </button>
              {step === 'mapping' && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleExecuteImport}
                  className="px-5 py-1.5 rounded bg-primary text-on-primary font-semibold hover:bg-primary/90 shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                  <span>Confirm & Ingest Records</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// SUB-COMPONENT: Batch Fill Tool Modal
// ==========================================
interface BatchFillModalProps {
  selectedCount: number;
  presets: PresetSettings;
  onApply: (changes: Record<string, any>) => void;
  onClose: () => void;
}

const BatchFillModal: React.FC<BatchFillModalProps> = ({ selectedCount, presets, onApply, onClose }) => {
  const [course, setCourse] = useState('');
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');
  const [dueDate, setDueDate] = useState('');

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const changes: Record<string, any> = {};
    if (course) changes.course = course;
    if (department) changes.department = department;
    if (year) changes.year = year;
    if (section) changes.section = section;
    if (dueDate) changes['fee.dueDate'] = dueDate;

    onApply(changes);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">format_paint</span>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">
              Quick Fill ({selectedCount} rows)
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-outline hover:text-on-surface">
            ✕
          </button>
        </div>

        <p className="text-xs text-on-surface-variant mb-4">
          Select any field you wish to bulk apply across all {selectedCount} selected students. Leave empty to keep existing cell values.
        </p>

        <form onSubmit={handleApply} className="flex flex-col gap-3 text-xs">
          <div>
            <label className="block text-on-surface-variant font-medium mb-1">Set Course</label>
            <select
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="w-full h-8 px-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface"
            >
              <option value="">-- Do Not Change --</option>
              {presets.courses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-on-surface-variant font-medium mb-1">Set Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full h-8 px-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface"
            >
              <option value="">-- Do Not Change --</option>
              {presets.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-on-surface-variant font-medium mb-1">Set Academic Year</label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full h-8 px-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface"
              >
                <option value="">-- Keep --</option>
                <option value="1">Year 1</option>
                <option value="2">Year 2</option>
                <option value="3">Year 3</option>
                <option value="4">Year 4</option>
              </select>
            </div>
            <div>
              <label className="block text-on-surface-variant font-medium mb-1">Set Section</label>
              <input
                type="text"
                placeholder="e.g. A"
                value={section}
                onChange={(e) => setSection(e.target.value.toUpperCase())}
                className="w-full h-8 px-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface uppercase"
              />
            </div>
          </div>

          <div>
            <label className="block text-on-surface-variant font-medium mb-1">Set Fee Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full h-8 px-2 bg-surface-container border border-outline-variant/30 rounded text-on-surface font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/20 mt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-surface-container text-on-surface font-medium hover:bg-surface-container-high"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-primary text-on-primary font-semibold hover:bg-primary/90 shadow-sm"
            >
              Apply to Selected Rows
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
