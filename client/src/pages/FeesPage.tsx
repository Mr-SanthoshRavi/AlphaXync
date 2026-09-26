import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { ReceiptModal, type ReceiptData } from '../components/ReceiptModal';
import { FeeRulesModal } from '../components/FeeRulesModal';
import { useAuth } from '../contexts/AuthContext';
import { useSheetMode } from '../contexts/SheetModeContext';

interface FeesPageProps {
  cashierMode: boolean;
}

export interface PaymentLog {
  id: string;
  amount: number;
  method: string;
  receiptNumber?: string;
  reference?: string;
  date: string | Date;
  verifiedAt?: string | Date;
  note?: string;
}

interface FeeRecord {
  id: string;
  studentId: string;
  studentName: string;
  registerNo: string;
  course: string;
  whatsappNumber: string;
  feeType: string;
  total: number;
  paid: number;
  balance: number;
  dueDate: string;
  fine: number;
  status: string;
  payments?: PaymentLog[];
}

export const FeesPage: React.FC<FeesPageProps> = ({ cashierMode }) => {
  const { institution } = useAuth();
  const { mode: activeSheetMode } = useSheetMode();
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [pagination, setPagination] = useState<{ total: number; page: number; limit: number; pages: number }>({
    total: 0,
    page: 1,
    limit: 25,
    pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showWaiveModal, setShowWaiveModal] = useState(false);
  const [showFeeRulesModal, setShowFeeRulesModal] = useState(false);

  // Selected fee item for modals
  const [selectedFee, setSelectedFee] = useState<FeeRecord | null>(null);

  // Split Payment Log viewing state
  const [viewingLogAccount, setViewingLogAccount] = useState<FeeRecord | null>(null);

  // Form states
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'OFFLINE' | 'UPI'>('UPI');
  const [refNumber, setRefNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [waiveReason, setWaiveReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);

  // AI Mismatch Verification State
  const [aiChecking, setAiChecking] = useState(false);
  const [aiResult, setAiResult] = useState<{
    isMatched: boolean;
    confidence: string;
    summary: string;
    warnings: string[];
  } | null>(null);

  // Live Gateway & WhatsApp Request States
  const [gatewayToken, setGatewayToken] = useState<string | null>(null);
  const [whatsAppSending, setWhatsAppSending] = useState(false);
  const [whatsAppNotice, setWhatsAppNotice] = useState<string | null>(null);

  // Auto-initiate gateway token when amount changes in UPI mode
  useEffect(() => {
    if (showOfflineModal && method === 'UPI' && selectedFee && Number(amount) > 0 && Number(amount) <= selectedFee.balance) {
      const timer = setTimeout(() => {
        initGatewayIntent(selectedFee.studentId, selectedFee.id, Number(amount));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [showOfflineModal, method, selectedFee?.id, amount]);

  const initGatewayIntent = async (studentId: string, feeAccountId: string, payAmt: number) => {
    if (payAmt <= 0) return;
    try {
      const res: any = await api.createPaymentRequest({
        studentId,
        feeAccountId,
        amount: payAmt,
      });
      const token = res?.paymentToken || res?.data?.paymentToken;
      if (token) {
        setGatewayToken(token);
      }
    } catch (err) {
      console.warn('Could not generate gateway intent:', err);
    }
  };

  const handleSendWhatsAppRequest = async () => {
    if (!selectedFee || !amount) return;
    const numAmt = Number(amount);
    if (numAmt <= 0 || numAmt > selectedFee.balance) return;

    setWhatsAppSending(true);
    setWhatsAppNotice(null);
    try {
      const res: any = await api.createPaymentRequest({
        studentId: selectedFee.studentId,
        feeAccountId: selectedFee.id,
        amount: numAmt,
        sendWhatsApp: true,
      });

      const token = res?.paymentToken || res?.data?.paymentToken;
      if (token) {
        setGatewayToken(token);
      }

      if (res?.whatsAppSent || res?.data?.whatsAppSent) {
        setWhatsAppNotice(`✓ Payment link of ₹${numAmt.toLocaleString('en-IN')} sent to ${selectedFee.studentName}'s WhatsApp!`);
      } else {
        const pUrl = res?.paymentUrl || res?.data?.paymentUrl || `/pay/${token || gatewayToken}`;
        setWhatsAppNotice(`✓ Link active: ${window.location.origin}${pUrl}`);
      }
    } catch (err: any) {
      setWhatsAppNotice(`Failed: ${err.message || 'Error sending WhatsApp link'}`);
    } finally {
      setWhatsAppSending(false);
    }
  };

  // Background Auto-Detector: Checks gateway payment completion every 2s
  useEffect(() => {
    if (!showOfflineModal || method !== 'UPI' || !gatewayToken) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res: any = await api.getPublicPaymentIntent(gatewayToken);
        const data = res?.data || res;
        if (data?.status === 'COMPLETED' && isMounted) {
          clearInterval(interval);
          const paidNum = data.amount || Number(amount);
          const remainingBal = data.balanceRemaining !== undefined ? data.balanceRemaining : Math.max(0, (selectedFee?.balance || 0) - paidNum);

          setFeedback(`✓ Payment of ₹${paidNum.toLocaleString('en-IN')} automatically verified & captured by Bank Gateway!`);

          setActiveReceipt({
            receiptNumber: data.receiptNumber || 'REC-CONFIRMED',
            studentName: data.studentName || selectedFee?.studentName || '',
            registerNo: data.registerNo || selectedFee?.registerNo || '',
            course: data.course || selectedFee?.course || '',
            amount: paidNum,
            paymentMethod: 'UPI',
            transactionReference: data.transactionId || 'Razorpay-Verified',
            date: new Date(),
            balanceRemaining: remainingBal,
            notes: 'Verified live UPI payment (Gateway-Confirmed)',
            logoUrl: institution?.logoUrl,
            institutionName: institution?.name,
            whatsappNumber: data.whatsappNumber || selectedFee?.whatsappNumber,
          });

          setShowOfflineModal(false);
          setGatewayToken(null);
          await fetchFees(pagination.page);
        }
      } catch (err) {
        // quiet poll
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [showOfflineModal, method, gatewayToken, selectedFee, amount]);

  const fetchFees = async (page = 1) => {
    try {
      setLoading(true);
      const targetProvider = activeSheetMode === 'native' ? 'native_sheet' : 'google_sheets';
      const res = await api.getFees({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        sourceProvider: targetProvider,
        page,
        limit: 25,
      });
      setFees(res.fees || []);
      if (res.pagination) {
        setPagination(res.pagination);
      }
    } catch (err: any) {
      console.error('Failed to load fees from API:', err);
      setFees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFees(1);

    const onDataUpdated = () => {
      fetchFees(pagination.page || 1);
    };

    window.addEventListener('campusflow:data-updated', onDataUpdated);

    return () => {
      window.removeEventListener('campusflow:data-updated', onDataUpdated);
    };
  }, [search, statusFilter, pagination.page, activeSheetMode]);

  const openOfflineModalFor = (item?: FeeRecord) => {
    const target = item || fees[0] || null;
    setSelectedFee(target);
    setMethod('UPI');
    setRefNumber('');
    setNotes('');
    setAiResult(null);
    setWhatsAppNotice(null);
    setGatewayToken(null);
    const initAmt = target && target.balance > 0 ? String(target.balance) : '';
    setAmount(initAmt);
    setShowOfflineModal(true);

    if (target && Number(initAmt) > 0) {
      initGatewayIntent(target.studentId, target.id, Number(initAmt));
    }
  };

  const handleAiVerify = async () => {
    if (!selectedFee || !amount) {
      setFeedback('Please enter an amount to run verification.');
      return;
    }
    const paidNum = Number(amount);
    if (isNaN(paidNum) || paidNum <= 0) {
      setFeedback('Please enter a valid amount.');
      return;
    }
    setAiChecking(true);
    try {
      const res = await api.aiReconcilePayment({
        studentId: selectedFee.studentId,
        amount: paidNum,
        method,
        reference: refNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (res?.data) {
        setAiResult(res.data);
      }
    } catch (err: any) {
      setAiResult({
        isMatched: false,
        confidence: 'LOW',
        summary: `Verification error: ${err.message || 'Failed to check mismatch'}`,
        warnings: [err.message || 'Check failed'],
      });
    } finally {
      setAiChecking(false);
    }
  };

  const openAdjustModalFor = (item?: FeeRecord) => {
    const target = item || fees[0] || null;
    setSelectedFee(target);
    if (target) {
      setAdjustAmount(String(target.total));
    }
    setShowAdjustModal(true);
  };

  const openWaiveModalFor = (item?: FeeRecord) => {
    const target = item || fees[0] || null;
    setSelectedFee(target);
    setShowWaiveModal(true);
  };

  const handleOfflinePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFee || !amount) return;

    const paidNum = Number(amount);
    if (selectedFee.balance <= 0) {
      setFeedback('Error: This student has already fully paid their fee balance.');
      return;
    }
    if (paidNum > selectedFee.balance) {
      setFeedback(`Error: Entered amount (₹${paidNum.toLocaleString('en-IN')}) exceeds remaining balance of ₹${selectedFee.balance.toLocaleString('en-IN')}.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.recordOfflinePayment({
        studentId: selectedFee.studentId,
        feeAccountId: selectedFee.id,
        amount: paidNum,
        method,
        reference: refNumber || undefined,
        note: notes || 'Counter payment',
      });
      const remainingBal = Math.max(0, selectedFee.balance - paidNum);
      const receiptNo = res?.payment?.receiptNumber || 'REC-CONFIRMED';
      setFeedback(`Payment of ₹${paidNum.toLocaleString('en-IN')} recorded! Voucher: ${receiptNo}`);
      
      // Open official printable receipt modal immediately
      setActiveReceipt({
        receiptNumber: receiptNo,
        studentName: selectedFee.studentName,
        registerNo: selectedFee.registerNo,
        course: selectedFee.course,
        amount: paidNum,
        paymentMethod: method,
        transactionReference: refNumber || receiptNo,
        date: new Date(),
        balanceRemaining: remainingBal,
        notes: notes || 'Counter payment',
        logoUrl: institution?.logoUrl,
        institutionName: institution?.name,
        whatsappNumber: selectedFee.whatsappNumber,
      });

      setShowOfflineModal(false);
      setAmount('');
      setRefNumber('');
      setNotes('');
      await fetchFees(pagination.page);
    } catch (err: any) {
      setFeedback(`Error: ${err.message || 'Failed to record payment'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustFeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFee || adjustAmount === '') return;

    const parsedAmount = Number(adjustAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setFeedback('Error: Please enter a valid non-negative fee amount (₹)');
      return;
    }

    if (parsedAmount < selectedFee.paid) {
      setFeedback(`Error: New total fee (₹${parsedAmount.toLocaleString('en-IN')}) cannot be less than already collected amount (₹${selectedFee.paid.toLocaleString('en-IN')}).`);
      return;
    }

    setSubmitting(true);
    try {
      await api.adjustFee({
        feeAccountId: selectedFee.id,
        newTotalAmount: parsedAmount,
        reason: adjustReason.trim() || 'Administrative fee revision',
      });
      setFeedback(`✓ Total Prescribed Fee successfully updated to ₹${parsedAmount.toLocaleString('en-IN')} for ${selectedFee.studentName} (Google Sheets synced)`);
      setShowAdjustModal(false);
      setAdjustReason('');
      await fetchFees(pagination.page);
    } catch (err: any) {
      setFeedback(`Error: ${err.message || 'Failed to adjust fee'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleWaiveFineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFee) return;

    setSubmitting(true);
    try {
      await api.waiveFine({
        feeAccountId: selectedFee.id,
        reason: waiveReason || 'Principal concession / medical waiver',
      });
      setFeedback('Fine successfully waived!');
      setShowWaiveModal(false);
      setWaiveReason('');
      await fetchFees(pagination.page);
    } catch (err: any) {
      setFeedback(`Error: ${err.message || 'Failed to waive fine'}`);
    } finally {
      setSubmitting(false);
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


  return (
    <div className="flex flex-col w-full pb-10">
      {/* Toast Feedback */}
      {feedback && (
        <div className="fixed top-16 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-2 rounded shadow-lg flex items-center gap-2 border border-outline-variant/30 text-body-sm animate-fade-in">
          <span className="material-symbols-outlined text-secondary-fixed text-[18px]">verified</span>
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="ml-2 text-outline-variant hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Title & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-outline-variant/20 mb-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 shadow-2xs border border-primary/20">
            <span className="material-symbols-outlined text-[26px]">receipt_long</span>
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold text-on-surface tracking-tight">
                Fees &amp; Protected Ledger
              </h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                <span className="material-symbols-outlined text-[13px]">verified_user</span>
                SERVER-PROTECTED
              </span>
            </div>
            <p className="text-xs md:text-sm text-on-surface-variant font-medium mt-0.5">
              Live fee reconciliation, counter receipts, structure rules &amp; ledger audits
            </p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => openOfflineModalFor()}
            disabled={fees.length === 0}
            className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm flex items-center gap-2 shadow-sm hover:shadow transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
            title="Record offline/counter payment"
          >
            <span className="material-symbols-outlined text-[19px]">point_of_sale</span>
            <span>Record Payment</span>
          </button>

          {!cashierMode && (
            <button
              onClick={() => setShowFeeRulesModal(true)}
              className="h-10 px-4 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-2xs"
              title="Configure fee structure & course amounts"
            >
              <span className="material-symbols-outlined text-[19px]">account_balance_wallet</span>
              <span>Fee Structure</span>
            </button>
          )}

          {!cashierMode && (
            <>
              <button
                onClick={() => openAdjustModalFor()}
                disabled={fees.length === 0}
                className="h-10 px-3.5 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl font-semibold text-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 cursor-pointer shadow-2xs"
                title="Adjust fee amount for student"
              >
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">tune</span>
                <span>Adjust Fee</span>
              </button>

              <button
                onClick={() => openWaiveModalFor()}
                disabled={fees.length === 0}
                className="h-10 px-3.5 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl font-semibold text-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 cursor-pointer shadow-2xs"
                title="Waive late fine for student"
              >
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">percent</span>
                <span>Waive Fine</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-2.5 mb-4 shadow-2xs flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5 flex-wrap flex-1">
          {/* Search Input */}
          <div className="relative min-w-[260px] sm:w-80">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-outline text-[18px]">search</span>
            <input
              type="text"
              placeholder="Search student, register no, course..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9 pr-8 bg-surface-container-low/50 border border-outline-variant/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/15 transition-all w-full"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-outline hover:text-on-surface text-xs w-5 h-5 rounded-full flex items-center justify-center hover:bg-surface-container-high transition-colors"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Dropdown Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 pl-3.5 pr-8 bg-surface-container-low/50 border border-outline-variant/30 rounded-xl text-sm font-medium text-on-surface focus:outline-none focus:border-primary focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/15 transition-all appearance-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="PAID">Paid (Settled)</option>
              <option value="PARTIAL">Partial (Installments)</option>
              <option value="PENDING">Pending (Unpaid)</option>
              <option value="OVERDUE">Overdue (Action Required)</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-2.5 pointer-events-none text-outline text-[18px]">
              expand_more
            </span>
          </div>

          {(search || statusFilter) && (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('');
              }}
              className="h-10 px-3 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-1 cursor-pointer"
              title="Reset all filters"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Ledger Count Badge */}
        <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low font-data-mono font-semibold text-on-surface">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span>{pagination.total > 0 ? `${pagination.total} Fee Accounts` : `${fees.length} Records`}</span>
          </span>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/20 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/25 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
              <th className="py-2.5 px-4">Student & Register No</th>
              <th className="py-2.5 px-4">Course</th>
              <th className="py-2.5 px-4 text-right">Prescribed Total</th>
              <th className="py-2.5 px-4 text-right">Ledger Paid</th>
              <th className="py-2.5 px-4 text-right">Remaining Balance</th>
              <th className="py-2.5 px-4 text-center">Status</th>
              <th className="py-2.5 px-4 text-right min-w-[290px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/15 text-body-sm text-on-surface">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-on-surface-variant">
                  <div className="flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                    <span>Loading fee accounts from ledger...</span>
                  </div>
                </td>
              </tr>
            ) : fees.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[32px] text-outline block mb-1">receipt</span>
                  <p className="font-medium text-on-surface">No fee accounts found</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Sync student data to generate fee ledgers automatically.
                  </p>
                </td>
              </tr>
            ) : (
              fees.map((account) => (
                <tr key={account.id} className="hover:bg-surface-container-low/60 transition-colors">
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-on-surface">{account.studentName}</div>
                    <div className="font-data-mono text-[11px] text-on-surface-variant">
                      {account.registerNo}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-on-surface-variant">
                    {account.course || 'General'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-data-mono">
                    ₹{Number(account.total).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-4 text-right font-data-mono text-secondary font-semibold">
                    ₹{Number(account.paid).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-4 text-right font-data-mono font-bold text-on-surface">
                    ₹{Number(account.balance).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {getStatusBadge(account.status)}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Slot 1: Pay CTA or Settled Badge */}
                      {account.balance > 0 ? (
                        <button
                          onClick={() => openOfflineModalFor(account)}
                          className="h-7 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 shadow-2xs transition-all active:scale-95 shrink-0"
                          title="Collect payment at counter"
                        >
                          <span className="material-symbols-outlined text-[14px]">payments</span>
                          <span>Pay</span>
                        </button>
                      ) : (
                        <span
                          className="h-7 px-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1 shrink-0"
                          title="Fee fully settled"
                        >
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          <span>Settled</span>
                        </span>
                      )}

                      {/* Slot 2: Installment Logs CTA */}
                      {account.payments && account.payments.length > 0 && (
                        <button
                          onClick={() => setViewingLogAccount(account)}
                          className="h-7 px-2 rounded-md bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/30 text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
                          title="View Installment Payment History"
                        >
                          <span className="material-symbols-outlined text-[14px] text-on-surface-variant">history</span>
                          <span>Logs</span>
                          <span className="px-1 py-0.2 rounded bg-primary/10 text-primary text-[10px] font-bold">
                            {account.payments.length}
                          </span>
                        </button>
                      )}

                      {/* Slot 3: Official Printable Receipt CTA */}
                      {account.payments && account.payments.length > 0 && (
                        <button
                          onClick={() => {
                            const p = account.payments![0];
                            setActiveReceipt({
                              receiptNumber: p.receiptNumber || `REC-${account.registerNo || account.id.slice(-6).toUpperCase()}`,
                              studentName: account.studentName,
                              registerNo: account.registerNo,
                              course: account.course,
                              amount: p.amount || account.paid,
                              paymentMethod: p.method || 'OFFLINE / ONLINE',
                              date: p.date ? new Date(p.date) : new Date(),
                              balanceRemaining: account.balance,
                              notes: p.note || `Tuition Fee (Total ₹${account.total.toLocaleString('en-IN')})`,
                              logoUrl: institution?.logoUrl,
                              institutionName: institution?.name,
                              whatsappNumber: account.whatsappNumber,
                            });
                          }}
                          className="h-7 px-2 rounded-md bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/30 text-xs font-medium flex items-center gap-1 transition-all active:scale-95 shrink-0"
                          title="Print / View Official Receipt"
                        >
                          <span className="material-symbols-outlined text-[14px] text-on-surface-variant">receipt_long</span>
                          <span>Receipt</span>
                        </button>
                      )}

                      {/* Slot 4: Adjust / Settings Tune */}
                      {!cashierMode && (
                        <button
                          onClick={() => openAdjustModalFor(account)}
                          className="w-7 h-7 rounded-md bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-all border border-outline-variant/20 hover:border-outline-variant/40 shrink-0"
                          title="Adjust Total Fee or Waive Fine"
                        >
                          <span className="material-symbols-outlined text-[15px]">tune</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {pagination.pages > 1 && (
          <div className="p-3 bg-surface-container-low border-t border-outline-variant/20 flex items-center justify-between text-xs text-on-surface-variant">
            <span>
              Page {pagination.page} of {pagination.pages} ({pagination.total} accounts)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchFees(pagination.page - 1)}
                className="px-2.5 py-1 rounded bg-surface-container border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container-high"
              >
                Previous
              </button>
              <button
                disabled={pagination.page >= pagination.pages}
                onClick={() => fetchFees(pagination.page + 1)}
                className="px-2.5 py-1 rounded bg-surface-container border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container-high"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Record Offline Payment */}
      {showOfflineModal && selectedFee && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-5 shadow-2xl border border-outline-variant/30 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-3 border-b border-outline-variant/20 pb-3">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">payments</span>
                  <span>Record Student Payment</span>
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Direct counter collection with automated WhatsApp digital receipt delivery.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowOfflineModal(false);
                  setAiResult(null);
                }}
                className="text-outline hover:text-on-surface p-1 rounded hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Student Identification Banner (Google Sheet Truth) */}
            <div className="mb-3.5 p-3 rounded-lg bg-surface-container-low border border-outline-variant/25 flex flex-col gap-1.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant block">
                    Verified Student (Google Sheet)
                  </span>
                  <div className="font-semibold text-sm text-on-surface">
                    {selectedFee.studentName}
                  </div>
                  <div className="text-xs text-on-surface-variant flex items-center gap-2 mt-0.5">
                    <span className="font-data-mono font-medium text-primary">
                      Reg No: {selectedFee.registerNo}
                    </span>
                    <span>•</span>
                    <span>{selectedFee.course}</span>
                  </div>

                  {/* WhatsApp / Paper Receipt Fallback Status */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {selectedFee.whatsappNumber ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium">
                        <span className="material-symbols-outlined text-[12px]">chat</span>
                        <span>WhatsApp Delivery: {selectedFee.whatsappNumber}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[10px] font-medium border border-amber-500/20">
                        <span className="material-symbols-outlined text-[12px]">print</span>
                        <span>Paper Receipt Mode (No WhatsApp on file — Print slip at counter)</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant block">
                    Outstanding Dues
                  </span>
                  <div className="font-data-mono font-bold text-base text-primary">
                    ₹{selectedFee.balance.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-on-surface-variant">
                    Total: ₹{selectedFee.total.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={handleOfflinePaymentSubmit} className="space-y-3.5">
              {/* Change Student Option */}
              <div>
                <label className="font-label-sm text-on-surface-variant block mb-1">
                  Change Student (Optional)
                </label>
                <select
                  value={selectedFee.id}
                  onChange={(e) => {
                    const match = fees.find((f) => f.id === e.target.value);
                    if (match) {
                      setSelectedFee(match);
                      setAiResult(null);
                      setWhatsAppNotice(null);
                      const amt = match.balance > 0 ? String(match.balance) : '';
                      setAmount(amt);
                      if (method === 'UPI' && Number(amt) > 0) {
                        initGatewayIntent(match.studentId, match.id, Number(amt));
                      }
                    }
                  }}
                  className="w-full h-8 px-2 bg-surface-container-low border border-outline-variant/30 rounded text-label-sm"
                >
                  {fees.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.studentName} ({f.registerNo}) — Balance: ₹{f.balance.toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount Input with Quick Presets */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-label-sm text-on-surface-variant block">
                    Payment Amount (₹)
                  </label>
                  {selectedFee.balance > 0 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const amt = String(selectedFee.balance);
                          setAmount(amt);
                          setAiResult(null);
                          if (method === 'UPI') {
                            initGatewayIntent(selectedFee.studentId, selectedFee.id, Number(amt));
                          }
                        }}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        Pay Full (₹{selectedFee.balance.toLocaleString('en-IN')})
                      </button>
                      {selectedFee.balance > 100 && (
                        <button
                          type="button"
                          onClick={() => {
                            const amt = String(Math.round(selectedFee.balance / 2));
                            setAmount(amt);
                            setAiResult(null);
                            if (method === 'UPI') {
                              initGatewayIntent(selectedFee.studentId, selectedFee.id, Number(amt));
                            }
                          }}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors"
                        >
                          Pay Half (₹{Math.round(selectedFee.balance / 2).toLocaleString('en-IN')})
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <input
                  type="number"
                  placeholder="Enter amount to collect (e.g. 5000)"
                  value={amount}
                  onChange={(e) => {
                    const newAmt = e.target.value;
                    setAmount(newAmt);
                    setAiResult(null);
                    if (method === 'UPI' && Number(newAmt) > 0) {
                      initGatewayIntent(selectedFee.studentId, selectedFee.id, Number(newAmt));
                    }
                  }}
                  required
                  min="1"
                  max={selectedFee.balance}
                  className="w-full h-9 px-2.5 bg-surface-container-low border border-outline-variant/30 rounded text-body-md font-data-mono font-bold text-on-surface focus:outline-hidden focus:border-primary"
                />

                {/* Live Balance After Payment & Status Indicator */}
                {amount && Number(amount) > 0 && (
                  <div className="mt-1.5 flex items-center justify-between text-xs px-1">
                    <span className="text-on-surface-variant">
                      Remaining balance: <strong className="font-data-mono text-on-surface">₹{Math.max(0, selectedFee.balance - Number(amount)).toLocaleString('en-IN')}</strong>
                    </span>
                    {Number(amount) === selectedFee.balance ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                        <span>✓</span> Full Settlement
                      </span>
                    ) : Number(amount) < selectedFee.balance ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold text-[11px]">
                        <span>⏳</span> Partial Installment
                      </span>
                    ) : (
                      <span className="text-error font-semibold">Exceeds remaining dues!</span>
                    )}
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="font-label-sm text-on-surface-variant block mb-1">Payment Method</label>
                <select
                  value={method}
                  onChange={(e) => {
                    const m = e.target.value as any;
                    setMethod(m);
                    setAiResult(null);
                    if (m === 'UPI' && Number(amount) > 0 && selectedFee) {
                      initGatewayIntent(selectedFee.studentId, selectedFee.id, Number(amount));
                    }
                  }}
                  className="w-full h-9 px-2 bg-surface-container-low border border-outline-variant/30 rounded text-label-sm font-medium"
                >
                  <option value="UPI">📱 UPI / Online Gateway (GPay, PhonePe, Paytm)</option>
                  <option value="CASH">🏢 Cash (On-Spot Counter Pay)</option>
                  <option value="BANK_TRANSFER">🏦 Bank Transfer (NEFT/RTGS/IMPS)</option>
                  <option value="CHEQUE">📄 Bank Cheque / DD</option>
                </select>
              </div>

              {/* Razorpay Gateway Live QR Section */}
              {method === 'UPI' && Number(amount) > 0 && (
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-3 animate-fade-in">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Razorpay Gateway Details & Info */}
                    <div className="flex-1 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        <span>Razorpay Live Institutional Payment Gateway</span>
                      </div>

                      <div className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-emerald-600 animate-pulse">qr_code_scanner</span>
                        <span>Scan with <strong>Google Pay / PhonePe / Paytm / Camera</strong> to pay <strong className="text-on-surface font-bold">₹{Number(amount).toLocaleString('en-IN')}</strong></span>
                      </div>

                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5 font-medium leading-tight">
                        <span className="material-symbols-outlined text-[15px] text-emerald-600 shrink-0 mt-0.5">bolt</span>
                        <span>Zero-Click Auto Detection: Razorpay will capture and verify the payment instantly. The receipt will popup automatically.</span>
                      </div>

                      {gatewayToken && (
                        <div className="pt-1 flex items-center gap-2">
                          <a
                            href={`/pay/${gatewayToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 hover:underline bg-primary/10 px-2 py-1 rounded"
                          >
                            <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                            <span>Open Checkout Portal in Tab</span>
                          </a>
                          <span className="text-[10px] text-on-surface-variant font-mono">Token: {gatewayToken.slice(0, 10)}...</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Razorpay Gateway Dynamic QR Code */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-28 h-28 bg-white p-1.5 rounded-lg border border-outline-variant/30 shadow-xs flex items-center justify-center overflow-hidden">
                        {gatewayToken ? (
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
                              `${window.location.origin}/pay/${gatewayToken}`
                            )}`}
                            alt="Razorpay Payment QR Code"
                            className="w-full h-full object-contain"
                            loading="eager"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center p-2">
                            <span className="material-symbols-outlined animate-spin text-primary text-[20px] mb-1">progress_activity</span>
                            <span className="text-[9px] text-on-surface-variant leading-tight">Generating Gateway QR...</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold text-on-surface-variant mt-1 font-data-mono">
                        ₹{Number(amount).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual Reference Number (Only for Bank Transfer / Cheque) */}
              {(method === 'BANK_TRANSFER' || method === 'CHEQUE') && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-label-sm text-on-surface-variant block">
                      {method === 'CHEQUE' ? 'Cheque / DD Number' : 'Bank UTR / NEFT Reference'}
                    </label>
                    {Number(amount) > 0 && (
                      <button
                        type="button"
                        onClick={handleAiVerify}
                        disabled={aiChecking}
                        className="text-[11px] font-semibold text-primary hover:text-primary/80 flex items-center gap-1 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {aiChecking ? 'progress_activity' : 'verified'}
                        </span>
                        <span>{aiChecking ? 'Checking...' : 'Check for Mismatch'}</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Enter reference number or voucher memo..."
                    value={refNumber}
                    onChange={(e) => {
                      setRefNumber(e.target.value);
                      setAiResult(null);
                    }}
                    required
                    className="w-full h-8 px-2 bg-surface-container-low border border-outline-variant/30 rounded text-body-sm font-data-mono"
                  />
                </div>
              )}

              {/* AI Verification Status Card (If checked for Cheque/Transfer) */}
              {aiResult && (
                <div
                  className={`p-2.5 rounded-lg text-xs border ${
                    aiResult.isMatched
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span className="material-symbols-outlined text-[16px]">
                      {aiResult.isMatched ? 'check_circle' : 'warning'}
                    </span>
                    <span>{aiResult.isMatched ? 'Clean Match Confirmed' : 'Verification Notice'}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-container font-mono uppercase">
                      {aiResult.confidence}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed">{aiResult.summary}</p>
                  {aiResult.warnings && aiResult.warnings.length > 0 && (
                    <ul className="mt-1 list-disc list-inside text-[10px] opacity-90">
                      {aiResult.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Notes / Cashier Remarks */}
              <div>
                <label className="font-label-sm text-on-surface-variant block mb-1">Notes / Cashier Remarks</label>
                <input
                  type="text"
                  placeholder={method === 'CASH' ? 'e.g. Received counter cash from father' : 'Optional memo...'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-8 px-2 bg-surface-container-low border border-outline-variant/30 rounded text-body-sm"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 flex justify-between items-center gap-2 border-t border-outline-variant/20 flex-wrap">
                {/* Left: Mini WhatsApp Request Button */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSendWhatsAppRequest}
                    disabled={whatsAppSending || !amount || Number(amount) <= 0 || Number(amount) > selectedFee.balance}
                    title={`Send payment request link to ${selectedFee.studentName}'s WhatsApp`}
                    className="h-8 px-2.5 rounded-md bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-40 border border-emerald-600/20"
                  >
                    <span className="material-symbols-outlined text-[15px] text-emerald-600">chat</span>
                    <span>{whatsAppSending ? 'Sending...' : 'Send WhatsApp Link'}</span>
                  </button>
                  {whatsAppNotice && (
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 truncate max-w-[180px]" title={whatsAppNotice}>
                      {whatsAppNotice.startsWith('✓') ? '✓ Link Sent' : whatsAppNotice}
                    </span>
                  )}
                </div>

                {/* Right: Cancel & Live Auto-Detect / Cash Submit Button */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOfflineModal(false);
                      setAiResult(null);
                      setGatewayToken(null);
                      setWhatsAppNotice(null);
                    }}
                    className="h-8 px-3 rounded-md text-label-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                  >
                    Cancel
                  </button>

                  {method === 'UPI' ? (
                    /* Live Bank Auto-Detection Badge (NO manual button so fake recording is impossible!) */
                    <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/25">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                      <span>Waiting for live scan & pay...</span>
                    </div>
                  ) : (
                    /* Manual Counter Entry Button (ONLY for physical Cash / Cheque / Bank Transfer) */
                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        !amount ||
                        Number(amount) <= 0 ||
                        Number(amount) > selectedFee.balance
                      }
                      className="h-8 px-3.5 rounded-md bg-secondary text-on-secondary text-label-sm font-semibold hover:bg-secondary/90 disabled:opacity-50 flex items-center gap-1.5 shadow-xs transition-all"
                    >
                      <span className="material-symbols-outlined text-[15px]">receipt_long</span>
                      <span>
                        {submitting
                          ? 'Recording...'
                          : method === 'CASH'
                          ? 'Record Cash & Issue Receipt'
                          : 'Record Payment & Issue Receipt'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adjust Fee */}
      {showAdjustModal && selectedFee && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-6 shadow-2xl border border-outline-variant/30 animate-fade-in">
            <div className="flex justify-between items-start mb-4 border-b border-outline-variant/20 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[22px]">tune</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Adjust Total Prescribed Fee</h3>
                </div>
                <p className="text-xs text-on-surface-variant mt-1">
                  Adjusting tuition fee updates both the Admin Protected Ledger and Google Sheets in real-time.
                </p>
              </div>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="w-7 h-7 rounded-md hover:bg-surface-container text-outline hover:text-on-surface flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleAdjustFeeSubmit} className="space-y-4">
              {/* Student Selector */}
              <div>
                <label className="font-label-sm text-on-surface-variant block mb-1 font-medium">Select Student</label>
                <select
                  value={selectedFee.id}
                  onChange={(e) => {
                    const found = fees.find((f) => f.id === e.target.value);
                    if (found) {
                      setSelectedFee(found);
                      setAdjustAmount(String(found.total));
                    }
                  }}
                  className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/35 rounded-md text-body-sm font-medium text-on-surface focus:outline-none focus:border-primary"
                >
                  {fees.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.studentName} ({f.registerNo}) — Prescribed: ₹{Number(f.total).toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Current Ledger Summary Pill */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-surface-container-low/70 rounded-lg border border-outline-variant/20 text-xs">
                <div>
                  <span className="text-on-surface-variant block text-[11px]">Current Fee</span>
                  <span className="font-data-mono font-semibold text-on-surface">₹{Number(selectedFee.total).toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block text-[11px]">Collected Paid</span>
                  <span className="font-data-mono font-semibold text-secondary">₹{Number(selectedFee.paid).toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block text-[11px]">New Balance</span>
                  <span className="font-data-mono font-bold text-on-surface">
                    ₹{Math.max(0, (Number(adjustAmount) || 0) - selectedFee.paid).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Warning if trying to adjust below collected amount */}
              {adjustAmount !== '' && Number(adjustAmount) < selectedFee.paid && (
                <div className="p-2.5 bg-error/10 border border-error/30 rounded text-error text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">warning</span>
                  <span>
                    New total fee (₹{Number(adjustAmount).toLocaleString('en-IN')}) cannot be lower than the already collected amount (₹{selectedFee.paid.toLocaleString('en-IN')}).
                  </span>
                </div>
              )}

              {/* New Total Amount Input */}
              <div>
                <label className="font-label-sm text-on-surface-variant block mb-1 font-medium">
                  New Total Amount (₹) <span className="text-error">*</span>
                </label>
                <input
                  type="number"
                  placeholder="Enter revised total fee (e.g. 55000)"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  required
                  min="0"
                  className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/35 rounded-md text-body-sm font-data-mono font-semibold text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              {/* Justification Reason Input */}
              <div>
                <label className="font-label-sm text-on-surface-variant block mb-1">
                  Justification Reason <span className="text-on-surface-variant/60 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Scholarship concession, principal approval, or lab fee adjustment"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/35 rounded-md text-body-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-between">
                <span className="text-[11px] text-on-surface-variant flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                  <span className="material-symbols-outlined text-[14px]">sync</span>
                  Two-Way Sheets Sync Active
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAdjustModal(false)}
                    className="h-8 px-3.5 rounded text-label-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || adjustAmount === '' || Number(adjustAmount) < selectedFee.paid}
                    className="h-8 px-4 rounded bg-primary text-on-primary text-label-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    {submitting ? (
                      <>
                        <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                        <span>Syncing...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        <span>Confirm Ledger Adjustment</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Waive Fine */}
      {showWaiveModal && selectedFee && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-lg max-w-md w-full p-space-lg shadow-2xl border border-outline-variant/30">
            <div className="flex justify-between items-center mb-space-md">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Waive Late Fine</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {selectedFee.studentName} (Current Fine: ₹{selectedFee.fine})
                </p>
              </div>
              <button onClick={() => setShowWaiveModal(false)} className="text-outline hover:text-on-surface">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleWaiveFineSubmit} className="space-y-3">
              <div>
                <label className="font-label-sm text-on-surface-variant block mb-1">Reason for Fine Waiver</label>
                <input
                  type="text"
                  placeholder="e.g. Medical emergency or administrative extension"
                  value={waiveReason}
                  onChange={(e) => setWaiveReason(e.target.value)}
                  required
                  className="w-full h-8 px-2 bg-surface-container-low border border-outline-variant/30 rounded text-body-sm"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowWaiveModal(false)}
                  className="px-3 py-1.5 rounded text-label-sm text-on-surface-variant hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded bg-primary text-on-primary text-label-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? 'Processing...' : 'Confirm Fine Waiver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Compact Mini Split Payment Logs Modal */}
      {viewingLogAccount && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-md w-full rounded-xl shadow-2xl border border-outline-variant/30 overflow-hidden animate-fade-in space-y-0">
            {/* Header */}
            <div className="p-3.5 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[18px]">history</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface leading-tight">
                    Split Payment Installment Logs
                  </h3>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    {viewingLogAccount.studentName} ({viewingLogAccount.registerNo})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingLogAccount(null)}
                className="w-7 h-7 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Financial Ledger Progress Card */}
            <div className="p-3.5 bg-surface-container-lowest border-b border-outline-variant/15 text-xs space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-on-surface-variant font-medium">Prescribed Total: ₹{viewingLogAccount.total.toLocaleString('en-IN')}</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 font-data-mono">
                  Paid: ₹{viewingLogAccount.paid.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((viewingLogAccount.paid / (viewingLogAccount.total || 1)) * 100))}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-on-surface-variant font-data-mono">
                <span>Remaining Balance: ₹{viewingLogAccount.balance.toLocaleString('en-IN')}</span>
                <span className="font-semibold text-secondary">
                  {Math.round((viewingLogAccount.paid / (viewingLogAccount.total || 1)) * 100)}% Settled
                </span>
              </div>
            </div>

            {/* Chronological Installment List */}
            <div className="p-3.5 max-h-80 overflow-y-auto space-y-2.5">
              <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-1 mb-1">
                <span className="material-symbols-outlined text-[13px]">receipt</span>
                <span>Payment Installments ({viewingLogAccount.payments?.length || 0})</span>
              </div>

              {(!viewingLogAccount.payments || viewingLogAccount.payments.length === 0) ? (
                <div className="py-6 text-center text-on-surface-variant text-xs">
                  <span className="material-symbols-outlined text-[24px] text-outline mb-1 block">payments</span>
                  <span>No payment transactions recorded yet.</span>
                </div>
              ) : (
                viewingLogAccount.payments.map((log, idx) => (
                  <div
                    key={log.id || idx}
                    className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/25 flex items-center justify-between gap-3 text-xs shadow-2xs hover:border-outline-variant/40 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                          +₹{Number(log.amount).toLocaleString('en-IN')}
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface text-[10px] font-mono font-bold uppercase">
                          {log.method}
                        </span>
                      </div>
                      <div className="text-[11px] text-on-surface-variant flex items-center gap-1 font-sans">
                        <span className="material-symbols-outlined text-[13px]">schedule</span>
                        <span>
                          {new Date(log.date).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      {log.receiptNumber && (
                        <div className="text-[10px] font-mono text-outline">
                          Receipt: {log.receiptNumber} {log.reference ? `• Ref: ${log.reference}` : ''}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setViewingLogAccount(null);
                        setActiveReceipt({
                          receiptNumber: log.receiptNumber || `REC-${viewingLogAccount.registerNo}`,
                          studentName: viewingLogAccount.studentName,
                          registerNo: viewingLogAccount.registerNo,
                          course: viewingLogAccount.course,
                          amount: log.amount,
                          paymentMethod: log.method,
                          transactionReference: log.reference,
                          date: log.date,
                          balanceRemaining: viewingLogAccount.balance,
                          notes: `Tuition Fee Installment (${log.method})`,
                          logoUrl: institution?.logoUrl,
                          institutionName: institution?.name,
                          whatsappNumber: viewingLogAccount.whatsappNumber,
                        });
                      }}
                      className="px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                      title="View Official Receipt for this payment"
                    >
                      <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                      <span>Receipt</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Mini Modal Footer */}
            <div className="p-2.5 bg-surface-container-low border-t border-outline-variant/20 flex justify-end">
              <button
                onClick={() => setViewingLogAccount(null)}
                className="px-3.5 py-1 bg-surface-container hover:bg-surface-container-high text-on-surface rounded text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Dynamic Fee Rules Engine Modal */}
      {showFeeRulesModal && (
        <FeeRulesModal onClose={() => {
          setShowFeeRulesModal(false);
          fetchFees(pagination.page || 1);
        }} />
      )}

      {/* Official Printable Receipt Modal */}
      <ReceiptModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
    </div>
  );
};
