import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { ReceiptModal, type ReceiptData } from '../components/ReceiptModal';
import { useAuth } from '../contexts/AuthContext';
import { AlphaSheetStudio } from '../components/sheet/AlphaSheetStudio';

interface StudentsPageProps {
  onOpenPaymentModal?: (student: any) => void;
  cashierMode: boolean;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ cashierMode }) => {
  const { institution } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [pagination, setPagination] = useState<{ total: number; page: number; limit: number; pages: number }>({
    total: 0,
    page: 1,
    limit: 25,
    pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [whatsappFilter, setWhatsappFilter] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [drawerData, setDrawerData] = useState<any | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'profile' | 'fees' | 'payments' | 'messages'>('profile');
  const [viewMode, setViewMode] = useState<'directory' | 'alphasheet'>(() => {
    try {
      return (localStorage.getItem('campusflow_students_view') as any) || 'alphasheet';
    } catch {
      return 'alphasheet';
    }
  });

  const handleViewModeChange = (mode: 'directory' | 'alphasheet') => {
    setViewMode(mode);
    try {
      localStorage.setItem('campusflow_students_view', mode);
    } catch {}
  };

  // Fast offline payment inside drawer
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'OFFLINE' | 'UPI'>('UPI');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleManualRefresh = async () => {
    try {
      setSyncing(true);
      setFetchError(null);
      await api.triggerSync().catch((err) => console.warn('Sync trigger notice:', err));
      await fetchStudents(pagination.page || 1);
    } catch (err: any) {
      console.error('Manual refresh error:', err);
      await fetchStudents(pagination.page || 1);
    } finally {
      setSyncing(false);
    }
  };

  const fetchStudents = async (page = 1) => {
    try {
      setLoading(true);
      setFetchError(null);
      const res = await api.getStudents({
        search: search.trim() || undefined,
        paymentStatus: statusFilter || undefined,
        whatsappStatus: whatsappFilter || undefined,
        page,
        limit: 25,
      });
      setStudents(res.students || []);
      if (res.pagination) {
        setPagination(res.pagination);
      }
    } catch (err: any) {
      console.error('Error fetching students:', err);
      setFetchError(err.message || 'Unable to connect to source ledger');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents(1);

    const onDataUpdated = () => {
      fetchStudents(pagination.page || 1);
    };

    window.addEventListener('campusflow:data-updated', onDataUpdated);

    return () => {
      window.removeEventListener('campusflow:data-updated', onDataUpdated);
    };
  }, [search, statusFilter, whatsappFilter, pagination.page]);

  const handleSelectStudent = async (student: any) => {
    setSelectedStudent(student);
    setDrawerLoading(true);
    setActionMessage(null);
    try {
      const detail = await api.getStudentDetail(student.id);
      setDrawerData(detail);
    } catch (err: any) {
      console.error('Failed to load student detail drawer data:', err);
      setDrawerData(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !paymentAmount) return;

    const feeAccountId = drawerData?.feeSummary?.id;
    if (!feeAccountId) {
      setActionMessage('Cannot record payment: fee account not found for this student.');
      return;
    }

    const paidNum = Number(paymentAmount);
    const prevBal = drawerData?.feeSummary?.balance !== undefined ? drawerData.feeSummary.balance : (selectedStudent?.fee?.balance || 0);
    if (prevBal <= 0) {
      setActionMessage('Cannot record payment: Student fee is already fully settled.');
      return;
    }
    if (paidNum > prevBal) {
      setActionMessage(`Cannot record payment: Amount (₹${paidNum.toLocaleString('en-IN')}) exceeds balance (₹${prevBal.toLocaleString('en-IN')}).`);
      return;
    }

    setSubmittingPayment(true);
    setActionMessage('Recording payment...');
    try {
      const res = await api.recordOfflinePayment({
        studentId: selectedStudent.id,
        feeAccountId,
        amount: paidNum,
        method: paymentMethod,
        note: paymentNotes || 'Cashier counter payment',
      });
      const receiptNo = res?.payment?.receiptNumber || 'CONFIRMED';
      setActionMessage(`Payment of ₹${paidNum.toLocaleString('en-IN')} recorded! Receipt: ${receiptNo}`);
      
      const newBal = Math.max(0, prevBal - paidNum);

      // Open printable official receipt modal
      setActiveReceipt({
        receiptNumber: receiptNo,
        studentName: selectedStudent.name,
        registerNo: selectedStudent.externalStudentId,
        course: selectedStudent.course,
        department: selectedStudent.department,
        amount: paidNum,
        paymentMethod,
        transactionReference: res?.payment?.reference || receiptNo,
        date: new Date(),
        balanceRemaining: newBal,
        notes: paymentNotes || 'Counter collection',
        logoUrl: institution?.logoUrl,
        institutionName: institution?.name,
        whatsappNumber: selectedStudent.whatsappNumber,
      });

      setPaymentAmount('');
      setPaymentNotes('');
      // Reload drawer detail and list
      await handleSelectStudent(selectedStudent);
      await fetchStudents(pagination.page);
    } catch (err: any) {
      setActionMessage(`Error: ${err.message || 'Payment recording failed'}`);
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleSendPaymentLink = async () => {
    if (!selectedStudent) return;
    const feeAccountId = drawerData?.feeSummary?.id;
    if (!feeAccountId) {
      setActionMessage('No active fee balance to generate a link for.');
      return;
    }

    const currentBalance = drawerData?.feeSummary?.balance !== undefined ? drawerData.feeSummary.balance : (selectedStudent?.fee?.balance || 0);
    if (currentBalance <= 0) {
      setActionMessage('Cannot generate payment link: Student has already fully settled all dues.');
      return;
    }

    const requestedAmount = paymentAmount ? Number(paymentAmount) : currentBalance;
    if (requestedAmount <= 0) {
      setActionMessage('Please enter a valid amount.');
      return;
    }

    if (requestedAmount > currentBalance) {
      setActionMessage(`Requested amount (₹${requestedAmount.toLocaleString('en-IN')}) exceeds remaining balance of ₹${currentBalance.toLocaleString('en-IN')}.`);
      return;
    }

    setActionMessage(`Generating payment link for ₹${requestedAmount.toLocaleString('en-IN')}...`);
    try {
      const res = await api.createPaymentRequest({
        studentId: selectedStudent.id,
        feeAccountId,
        amount: requestedAmount,
      });
      setActionMessage(`Custom link created: ${window.location.origin}${res.paymentUrl}`);
    } catch (err: any) {
      setActionMessage(`Error: ${err.message || 'Failed to dispatch link'}`);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PAID':
      case 'CLEARED':
        return (
          <span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-data-mono text-[11px] font-semibold">
            PAID
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-data-mono text-[11px] font-semibold">
            PARTIAL
          </span>
        );
      case 'OVERDUE':
        return (
          <span className="px-2 py-0.5 rounded bg-error-container text-on-error-container font-data-mono text-[11px] font-semibold">
            OVERDUE
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-data-mono text-[11px] font-semibold">
            PENDING
          </span>
        );
    }
  };

  const getRecordStateBadge = (state: string) => {
    switch (state) {
      case 'VALID':
        return <span className="w-2 h-2 rounded-full bg-secondary" title="Source valid and verified"></span>;
      case 'INVALID':
        return <span className="w-2 h-2 rounded-full bg-error" title="Invalid data or missing phone"></span>;
      default:
        return <span className="w-2 h-2 rounded-full bg-outline" title={state}></span>;
    }
  };

  return (
    <div className="flex flex-col w-full pb-10">
      {/* Title & Toolbar */}
      <div className="flex items-center justify-between py-space-sm mb-space-md flex-wrap gap-3">
        <div className="flex items-center gap-space-xs flex-wrap">
          <span className="material-symbols-outlined text-primary text-[24px]">school</span>
          <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">Master Student Directory</h1>
          {cashierMode && (
            <span className="font-data-mono text-[11px] bg-secondary text-on-secondary px-2 py-0.5 rounded font-semibold ml-2">
              CASHIER DESK
            </span>
          )}

          {/* View Mode Switcher Pill */}
          <div className="flex items-center bg-surface-container p-0.5 rounded-lg border border-outline-variant/30 ml-2">
            <button
              onClick={() => handleViewModeChange('alphasheet')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-label-sm font-semibold transition-all ${
                viewMode === 'alphasheet'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">grid_on</span>
              <span>AlphaSheet Studio</span>
              <span className="font-data-mono text-[9px] px-1 py-0.2 rounded bg-white/20 ml-0.5">NATIVE</span>
            </button>
            <button
              onClick={() => handleViewModeChange('directory')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-label-sm font-medium transition-all ${
                viewMode === 'directory'
                  ? 'bg-surface-container-lowest text-primary shadow-xs font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">view_list</span>
              <span>Directory Table</span>
            </button>
          </div>

          {viewMode === 'directory' && (
            <span className="font-data-mono text-[12px] bg-surface-container px-2 py-0.5 rounded text-on-surface-variant ml-2">
              {pagination.total} Records
            </span>
          )}
        </div>

        {/* Filter Controls (Shown in Directory Table Mode) */}
        {viewMode === 'directory' && (
          <div className="flex items-center gap-space-xs flex-wrap">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-[16px]">search</span>
              <input
                type="text"
                placeholder="Search name, register no, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 pr-3 bg-surface-container-lowest border border-outline-variant/30 rounded text-body-sm text-on-surface focus:outline-none focus:border-primary w-60"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 px-2 bg-surface-container-lowest border border-outline-variant/30 rounded text-label-sm text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="">All Payment Statuses</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
              <option value="PENDING">Pending</option>
              <option value="OVERDUE">Overdue</option>
            </select>

            <select
              value={whatsappFilter}
              onChange={(e) => setWhatsappFilter(e.target.value)}
              className="h-8 px-2 bg-surface-container-lowest border border-outline-variant/30 rounded text-label-sm text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="">All Phone Statuses</option>
              <option value="valid">Valid WhatsApp</option>
              <option value="invalid">Missing / Invalid</option>
            </select>

            <button
              onClick={handleManualRefresh}
              disabled={syncing || loading}
              className="h-8 px-space-sm bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface rounded font-label-sm text-label-sm flex items-center gap-1.5 transition-all disabled:opacity-60"
              title="Pull latest live changes directly from Google Sheets"
            >
              <span className={`material-symbols-outlined text-[16px] ${syncing ? 'animate-spin text-primary' : ''}`}>
                {syncing ? 'sync' : 'refresh'}
              </span>
              <span>{syncing ? 'Syncing Sheet...' : 'Sync & Refresh'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content View Switch */}
      {viewMode === 'alphasheet' ? (
        <AlphaSheetStudio onOpenStudentDrawer={handleSelectStudent} />
      ) : (
        <div className="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/20 overflow-hidden">
          <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/25 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
              <th className="py-2.5 px-4 w-10 text-center">State</th>
              <th className="py-2.5 px-4">Student & Register No</th>
              <th className="py-2.5 px-4">Course & Dept</th>
              <th className="py-2.5 px-4">WhatsApp Contact</th>
              <th className="py-2.5 px-4">Fee Status</th>
              <th className="py-2.5 px-4 text-right">Ledger Balance</th>
              <th className="py-2.5 px-4 text-center w-20">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/15 text-body-sm text-on-surface">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-on-surface-variant">
                  <div className="flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                    <span>Loading student records from ledger...</span>
                  </div>
                </td>
              </tr>
            ) : fetchError ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-error">
                  <span className="material-symbols-outlined text-[32px] text-error block mb-1">cloud_off</span>
                  <p className="font-semibold text-on-surface">Unable to sync source data</p>
                  <p className="text-xs text-error/80 mt-0.5">{fetchError}</p>
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[32px] text-outline block mb-1">person_search</span>
                  <p className="font-medium text-on-surface">No student data available</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Sync from Google Sheets or Excel to populate student accounts.
                  </p>
                </td>
              </tr>
            ) : (
              students.map((student) => {
                const isSelected = selectedStudent?.id === student.id;
                const balance = student.fee?.balance ?? 0;

                return (
                  <tr
                    key={student.id}
                    onClick={() => handleSelectStudent(student)}
                    className={`cursor-pointer hover:bg-surface-container-low/60 transition-colors ${
                      isSelected ? 'bg-surface-container-high/60 font-medium' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4 text-center">
                      <div className="flex justify-center">{getRecordStateBadge(student.validationStatus)}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-on-surface">{student.name}</div>
                      <div className="font-data-mono text-[11px] text-on-surface-variant">{student.externalStudentId}</div>
                      {(student.sourceSheetId || student.sourceRowReference) && (
                        <div className="font-data-mono text-[10px] text-on-surface-variant/75 flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-[11px] text-primary/70">table_rows</span>
                          <span>{student.sourceSheetId || 'Sheet'} • {student.sourceRowReference || 'Row'}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <div>{student.course}</div>
                      <div className="text-[11px] text-on-surface-variant">
                        {student.department ? `${student.department} • ` : ''}Year {student.year || '1'}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-data-mono text-[12px] text-on-surface">
                      {student.whatsappNumber || (
                        <span className="text-error flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">warning</span>
                          <span>Missing</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {getStatusBadge(student.fee?.status || 'PENDING')}
                    </td>
                    <td className="py-2.5 px-4 text-right font-data-mono font-semibold text-on-surface">
                      ₹{Number(balance).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectStudent(student);
                        }}
                        className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                        title="Open Details Drawer"
                      >
                        <span className="material-symbols-outlined text-[18px]">side_navigation</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {pagination.pages > 1 && (
          <div className="p-3 bg-surface-container-low border-t border-outline-variant/20 flex items-center justify-between text-xs text-on-surface-variant">
            <span>
              Page {pagination.page} of {pagination.pages} ({pagination.total} total students)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchStudents(pagination.page - 1)}
                className="px-2.5 py-1 rounded bg-surface-container border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container-high"
              >
                Previous
              </button>
              <button
                disabled={pagination.page >= pagination.pages}
                onClick={() => fetchStudents(pagination.page + 1)}
                className="px-2.5 py-1 rounded bg-surface-container border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container-high"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* 480px Slide-out Right Drawer */}
      {selectedStudent && (
        <div className="fixed inset-y-0 right-0 w-[480px] bg-surface-container-lowest border-l border-outline-variant/30 shadow-2xl z-50 flex flex-col justify-between animate-slide-in">
          {/* Drawer Header */}
          <div className="p-space-md border-b border-outline-variant/20 flex items-start justify-between bg-surface-container-low">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-headline-sm text-headline-sm text-on-surface truncate">{selectedStudent.name}</h2>
                {getStatusBadge(drawerData?.feeSummary?.status || selectedStudent.fee?.status || 'PENDING')}
              </div>
              <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-0.5">
                <span className="font-data-mono">{selectedStudent.externalStudentId}</span>
                <span>•</span>
                <span>{selectedStudent.course}</span>
              </div>
            </div>
            <button
              onClick={() => setSelectedStudent(null)}
              className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Drawer Nav Tabs */}
          <div className="flex border-b border-outline-variant/20 px-space-md gap-4 bg-surface-container-lowest">
            {(['profile', 'fees', 'payments', 'messages'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveDrawerTab(tab)}
                className={`py-2 text-label-sm font-label-sm capitalize border-b-2 transition-colors ${
                  activeDrawerTab === tab
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Drawer Content */}
          <div className="p-space-md overflow-y-auto flex-1 space-y-4">
            {drawerLoading ? (
              <div className="py-12 flex justify-center text-on-surface-variant">
                <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
              </div>
            ) : (
              <>
                {/* Profile Tab */}
                {activeDrawerTab === 'profile' && (
                  <div className="space-y-3">
                    <div className="bg-surface-container-low p-space-sm rounded">
                      <span className="font-label-sm text-on-surface-variant block mb-1">Parent & Contact</span>
                      <div className="text-body-sm text-on-surface font-medium">
                        Father / Guardian: {selectedStudent.fatherName || 'Not specified'}
                      </div>
                      {drawerData?.student?.motherName && (
                        <div className="text-body-sm text-on-surface">Mother: {drawerData.student.motherName}</div>
                      )}
                      <div className="text-body-sm font-data-mono text-on-surface mt-1">
                        Phone: {selectedStudent.whatsappNumber || 'Missing'}
                      </div>
                    </div>

                    <div className="bg-surface-container-low p-space-sm rounded">
                      <span className="font-label-sm text-on-surface-variant block mb-1">Academic Profile</span>
                      <div className="text-body-sm text-on-surface">Course: {selectedStudent.course}</div>
                      <div className="text-body-sm text-on-surface">Department: {selectedStudent.department || 'N/A'}</div>
                      <div className="text-body-sm text-on-surface">
                        Year: Year {selectedStudent.year || '1'} (Section {selectedStudent.section || 'A'})
                      </div>
                    </div>

                    <div className="bg-surface-container-low p-space-sm rounded">
                      <span className="font-label-sm text-on-surface-variant block mb-1">Validation & Ledger State</span>
                      <div className="flex items-center gap-2">
                        {getRecordStateBadge(selectedStudent.validationStatus)}
                        <span className="font-data-mono text-body-sm uppercase">{selectedStudent.validationStatus}</span>
                      </div>
                      {drawerData?.student?.validationIssues?.length > 0 && (
                        <div className="text-xs text-error mt-1 space-y-0.5">
                          {drawerData.student.validationIssues.map((issue: string, i: number) => (
                            <div key={i}>• {issue}</div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-surface-container-low p-space-sm rounded border border-outline-variant/30">
                      <div className="flex items-center gap-1.5 font-label-sm text-primary font-semibold mb-1.5">
                        <span className="material-symbols-outlined text-[16px]">verified</span>
                        <span>Traceable Source Reference (Rule 13)</span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Source Provider:</span>
                          <span className="font-data-mono font-medium text-on-surface capitalize">
                            {drawerData?.student?.sourceProvider || selectedStudent?.sourceProvider || 'Google Sheets'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Master Sheet:</span>
                          <span className="font-data-mono font-medium text-on-surface">
                            {drawerData?.student?.sourceSheetId || selectedStudent?.sourceSheetId || 'Students_Master'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Spreadsheet Row Reference:</span>
                          <span className="font-data-mono font-semibold text-primary">
                            {drawerData?.student?.sourceRowReference || selectedStudent?.sourceRowReference || 'Row A2:N2'}
                          </span>
                        </div>
                        {(drawerData?.student?.lastSourceSyncAt || selectedStudent?.lastSourceSyncAt) && (
                          <div className="flex justify-between border-t border-outline-variant/20 pt-1 text-[11px] text-on-surface-variant">
                            <span>Last Source Sync:</span>
                            <span>{new Date(drawerData?.student?.lastSourceSyncAt || selectedStudent?.lastSourceSyncAt).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Fees Tab */}
                {activeDrawerTab === 'fees' && (
                  <div className="space-y-3">
                    <div className="bg-surface-container-low p-space-md rounded">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-label-sm text-on-surface-variant">Annual Prescribed Fee:</span>
                        <span className="font-data-mono font-semibold">
                          ₹{(drawerData?.feeSummary?.total ?? selectedStudent.fee?.total ?? 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mb-2 text-secondary">
                        <span className="font-label-sm">Total Paid into Ledger:</span>
                        <span className="font-data-mono font-semibold">
                          - ₹{(drawerData?.feeSummary?.paid ?? selectedStudent.fee?.paid ?? 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="border-t border-outline-variant/30 pt-2 flex justify-between items-center text-primary">
                        <span className="font-headline-sm font-semibold">Remaining Balance:</span>
                        <span className="font-data-mono font-headline-sm font-bold">
                          ₹{(drawerData?.feeSummary?.balance ?? selectedStudent.fee?.balance ?? 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    {/* Quick Payment Action Trigger or Settled Card */}
                    {(drawerData?.feeSummary?.balance ?? selectedStudent.fee?.balance ?? 0) <= 0 ? (
                      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 p-space-sm rounded space-y-2">
                        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                          <span className="material-symbols-outlined text-[20px]">check_circle</span>
                          <div>
                            <span className="font-semibold text-xs block">Fee Cleared & Fully Settled</span>
                            <span className="text-[11px] opacity-80">This student has zero outstanding balance.</span>
                          </div>
                        </div>
                        {drawerData?.paymentHistory && drawerData.paymentHistory.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const lastPmt = drawerData.paymentHistory[0];
                              setActiveReceipt({
                                receiptNumber: lastPmt.receiptNumber || 'REC-SETTLED',
                                studentName: selectedStudent.name,
                                registerNo: selectedStudent.externalStudentId,
                                course: selectedStudent.course,
                                department: selectedStudent.department,
                                amount: lastPmt.amount,
                                paymentMethod: lastPmt.method,
                                transactionReference: lastPmt.reference || lastPmt.receiptNumber,
                                date: lastPmt.verifiedAt || lastPmt.createdAt,
                                balanceRemaining: 0,
                                logoUrl: institution?.logoUrl,
                                institutionName: institution?.name,
                                whatsappNumber: selectedStudent.whatsappNumber,
                              });
                            }}
                            className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-label-sm text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[15px]">print</span>
                            <span>Print / Download Settlement Receipt</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="bg-surface-container-lowest border border-outline-variant/30 p-space-sm rounded">
                          <span className="font-label-sm text-on-surface font-semibold block mb-2">
                            Counter Offline Payment Entry
                          </span>
                          <form onSubmit={handleRecordPayment} className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="number"
                                placeholder="Amount ₹"
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                required
                                min="1"
                                max={drawerData?.feeSummary?.balance ?? selectedStudent.fee?.balance ?? 0}
                                className="h-8 px-2 bg-surface-container-low border border-outline-variant/30 rounded text-body-sm flex-1 font-data-mono"
                              />
                              <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value as any)}
                                className="h-8 px-2 bg-surface-container-low border border-outline-variant/30 rounded text-label-sm"
                              >
                                <option value="UPI">📱 UPI / QR (GPay, PhonePe, Paytm)</option>
                                <option value="CASH">🏢 Cash (On-Spot Counter Pay)</option>
                                <option value="BANK_TRANSFER">🏦 Bank Transfer (NEFT/RTGS)</option>
                                <option value="CHEQUE">📄 Cheque / DD</option>
                              </select>
                            </div>
                            {paymentAmount && Number(paymentAmount) > (drawerData?.feeSummary?.balance ?? selectedStudent.fee?.balance ?? 0) && (
                              <p className="text-xs text-error flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px]">warning</span>
                                <span>Amount exceeds balance by ₹{(Number(paymentAmount) - (drawerData?.feeSummary?.balance ?? selectedStudent.fee?.balance ?? 0)).toLocaleString('en-IN')}</span>
                              </p>
                            )}
                            <input
                              type="text"
                              placeholder="Receipt / Voucher Reference notes..."
                              value={paymentNotes}
                              onChange={(e) => setPaymentNotes(e.target.value)}
                              className="h-8 px-2 bg-surface-container-low border border-outline-variant/30 rounded text-body-sm w-full"
                            />
                            <button
                              type="submit"
                              disabled={submittingPayment}
                              className="w-full h-8 bg-secondary hover:bg-secondary/90 text-on-secondary font-label-sm text-label-sm rounded flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-[16px]">check_circle</span>
                              <span>{submittingPayment ? 'Recording...' : 'Record Payment & Issue Receipt'}</span>
                            </button>
                          </form>
                        </div>

                        <button
                          onClick={handleSendPaymentLink}
                          className="w-full h-8 bg-primary hover:bg-primary-container text-on-primary font-label-sm text-label-sm rounded flex items-center justify-center gap-1 shadow-sm"
                        >
                          <span className="material-symbols-outlined text-[16px]">send</span>
                          <span>Generate Online Payment Link</span>
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Payments Tab */}
                {activeDrawerTab === 'payments' && (
                  <div className="space-y-2">
                    {(!drawerData?.paymentHistory || drawerData.paymentHistory.length === 0) ? (
                      <div className="py-8 text-center text-on-surface-variant text-body-sm">
                        No verified payment transactions recorded yet.
                      </div>
                    ) : (
                      drawerData.paymentHistory.map((pmt: any) => (
                        <div key={pmt.id} className="p-space-xs bg-surface-container-low rounded border border-outline-variant/20">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-data-mono font-semibold text-secondary">
                                ₹{Number(pmt.amount).toLocaleString('en-IN')}
                              </span>
                              <span className="text-[11px] text-on-surface-variant ml-2 font-data-mono">
                                {pmt.receiptNumber}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded bg-secondary-container text-on-secondary-container font-data-mono text-[10px] font-bold">
                                {pmt.status}
                              </span>
                              <button
                                onClick={() => setActiveReceipt({
                                  receiptNumber: pmt.receiptNumber || 'REC-VERIFIED',
                                  studentName: selectedStudent?.name,
                                  registerNo: selectedStudent?.externalStudentId,
                                  course: selectedStudent?.course,
                                  department: selectedStudent?.department,
                                  amount: pmt.amount,
                                  paymentMethod: pmt.method,
                                  transactionReference: pmt.reference || pmt.receiptNumber,
                                  date: pmt.verifiedAt || pmt.createdAt,
                                  balanceRemaining: drawerData?.feeSummary?.balance,
                                  logoUrl: institution?.logoUrl,
                                  institutionName: institution?.name,
                                  whatsappNumber: selectedStudent?.whatsappNumber,
                                })}
                                className="px-2 py-0.5 bg-primary/10 hover:bg-primary/20 text-primary rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                                title="Print / Download Official Receipt"
                              >
                                <span className="material-symbols-outlined text-[13px]">print</span>
                                <span>Receipt</span>
                              </button>
                            </div>
                          </div>
                          <div className="flex justify-between text-[11px] text-on-surface-variant mt-1">
                            <span>Method: {pmt.method}</span>
                            <span>{pmt.verifiedAt ? new Date(pmt.verifiedAt).toLocaleDateString() : 'Pending'}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Messages Tab */}
                {activeDrawerTab === 'messages' && (
                  <div className="space-y-2">
                    {(!drawerData?.messageHistory || drawerData.messageHistory.length === 0) ? (
                      <div className="py-8 text-center text-on-surface-variant text-body-sm">
                        No WhatsApp communications logged for this student.
                      </div>
                    ) : (
                      drawerData.messageHistory.map((msg: any) => (
                        <div key={msg.id} className="p-space-xs bg-surface-container-low rounded text-body-sm">
                          <div className="flex justify-between">
                            <span className="font-semibold text-on-surface font-label-sm">{msg.templateName}</span>
                            <span className="font-data-mono text-[10px] text-secondary font-bold">{msg.status}</span>
                          </div>
                          <div className="text-[11px] text-on-surface-variant mt-0.5">
                            {msg.sentAt ? new Date(msg.sentAt).toLocaleString() : 'Queued'}
                          </div>
                          {msg.failureReason && (
                            <div className="text-[11px] text-error mt-0.5">Reason: {msg.failureReason}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Status Toast in Drawer */}
                {actionMessage && (
                  <div className="p-2 bg-surface-container-high rounded text-body-sm text-on-surface font-medium border border-outline-variant/30 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary">info</span>
                    <span className="break-all">{actionMessage}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Official Printable Receipt Modal */}
      <ReceiptModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
    </div>
  );
};
