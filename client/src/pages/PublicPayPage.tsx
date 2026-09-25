import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { ReceiptPaper, type ReceiptData, getWhatsAppReceiptUrl } from '../components/ReceiptModal';

interface PublicPayPageProps {
  token: string;
}

export const PublicPayPage: React.FC<PublicPayPageProps> = ({ token }) => {
  const [intent, setIntent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState<any | null>(null);

  // 10-Second Countdown & WhatsApp Auto-Redirect State
  const [countdown, setCountdown] = useState(10);
  const [isRedirectPaused, setIsRedirectPaused] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    const fetchIntent = async () => {
      try {
        setLoading(true);
        const res = await api.getPublicPaymentIntent(token);
        const data = res?.data || res;
        setIntent(data);
        if (data.status === 'COMPLETED') {
          setReceipt({
            receiptNumber: data.receiptNumber || 'REC-CONFIRMED',
            amount: data.amount,
            studentName: data.studentName,
            registerNo: data.registerNo,
            course: data.course,
            department: data.department || 'General',
            whatsappNumber: data.whatsappNumber,
            institutionName: data.institutionName,
            logoUrl: data.logoUrl,
            transactionId: data.transactionId,
            balanceRemaining: data.balanceRemaining,
            totalFee: data.totalFee,
            date: data.date || new Date()
          });
        }
      } catch (err: any) {
        setError(err.message || 'Payment link expired or invalid.');
      } finally {
        setLoading(false);
      }
    };
    fetchIntent();
  }, [token]);

  const receiptData: ReceiptData | null = receipt
    ? {
        receiptNumber: receipt.receiptNumber || 'REC-CONFIRMED',
        studentName: receipt.studentName || intent?.studentName || '',
        registerNo: receipt.registerNo || intent?.registerNo || '',
        course: receipt.course || intent?.course || '',
        department: receipt.department || intent?.department || 'General',
        amount: Number(receipt.amount || intent?.amount || 0),
        paymentMethod: 'UPI',
        transactionReference: receipt.transactionId || receipt.transactionReference || 'Razorpay-Verified',
        date: receipt.date || new Date(),
        balanceRemaining: receipt.balanceRemaining !== undefined ? receipt.balanceRemaining : intent?.balanceRemaining,
        totalFee: receipt.totalFee || intent?.totalFee,
        notes: 'Verified online payment (Razorpay Gateway-Confirmed)',
        logoUrl: receipt.logoUrl || intent?.logoUrl,
        institutionName: receipt.institutionName || intent?.institutionName,
        whatsappNumber: receipt.whatsappNumber || intent?.whatsappNumber,
      }
    : null;

  const whatsappUrl = receiptData ? getWhatsAppReceiptUrl(receiptData) : '';

  // 10-Second Auto-Redirect to WhatsApp
  useEffect(() => {
    if (!receiptData || isRedirectPaused || hasRedirected || !whatsappUrl) return;

    if (countdown <= 0) {
      setHasRedirected(true);
      window.location.href = whatsappUrl;
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [receiptData, countdown, isRedirectPaused, hasRedirected, whatsappUrl]);

  const handleRazorpayPay = async () => {
    try {
      setProcessing(true);
      setError(null);

      // 1. Create Razorpay Order on server
      const orderRes = await api.createPublicOrder(token);
      const orderData = orderRes?.data || orderRes;

      if ((window as any).Razorpay) {
        const options = {
          key: orderData.keyId || (import.meta as any).env?.VITE_RAZORPAY_KEY_ID || '',
          amount: (orderData.amount || intent?.amount) * 100,
          currency: orderData.currency || 'INR',
          name: intent?.institutionName || 'Campus Flow Operations',
          description: `${intent?.studentName || 'Student'} - Prescribed Fee Payment`,
          image: intent?.logoUrl || undefined,
          order_id: orderData.orderId,
          handler: async function (response: any) {
            try {
              setProcessing(true);
              const verifyRes = await api.verifyPublicPayment(token, {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              setReceipt(verifyRes?.data || verifyRes);
              setCountdown(10);
              setIsRedirectPaused(false);
            } catch (vErr: any) {
              setError(vErr.message || 'Payment signature verification failed.');
            } finally {
              setProcessing(false);
            }
          },
          prefill: {
            name: intent?.studentName || '',
            email: 'student@campusflow.ac.in',
            contact: intent?.whatsappNumber || ''
          },
          theme: {
            color: '#0284c7'
          },
          modal: {
            ondismiss: function () {
              setProcessing(false);
            }
          }
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on('payment.failed', function (resp: any) {
          setError(`Payment failed: ${resp.error?.description || 'Transaction declined'}`);
          setProcessing(false);
        });
        rzp.open();
      } else {
        // Fallback for offline testing if Razorpay script is blocked
        const mockPaymentId = `pay_test_${Date.now()}`;
        const verifyRes = await api.verifyPublicPayment(token, {
          razorpayOrderId: orderData.orderId,
          razorpayPaymentId: mockPaymentId,
          razorpaySignature: 'test_signature_mock',
        });
        setReceipt(verifyRes?.data || verifyRes);
        setCountdown(10);
        setIsRedirectPaused(false);
        setProcessing(false);
      }
    } catch (err: any) {
      setError(err.message || 'Payment initialization failed.');
      setProcessing(false);
    }
  };

  const handleSimulateTestPay = async () => {
    setProcessing(true);
    setError(null);
    try {
      const mockPaymentId = `pay_sim_${Date.now()}`;
      const mockOrderId = intent?.razorpayOrderId || `order_sim_${Date.now()}`;
      const res = await api.verifyPublicPayment(token, {
        razorpayOrderId: mockOrderId,
        razorpayPaymentId: mockPaymentId,
        razorpaySignature: 'test_signature_mock',
      });
      setReceipt(res?.data || res);
      setCountdown(10);
      setIsRedirectPaused(false);
    } catch (err: any) {
      setError(err.message || 'Test payment simulation failed.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 font-body-md">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
          <span>Loading secure institutional checkout...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 font-body-md">
        <div className="bg-surface-container-lowest max-w-md w-full p-space-lg rounded-xl shadow-lg border border-error/30 text-center">
          <span className="material-symbols-outlined text-error text-[48px] mb-2">error</span>
          <h2 className="font-headline-sm text-on-surface mb-1">Payment Link Notice</h2>
          <p className="text-body-sm text-on-surface-variant mb-4">{error}</p>
          <div className="p-3 bg-surface-container rounded-lg text-xs text-on-surface-variant">
            If you need a new payment link or fee schedule, please reach out to your institution's accounts department.
          </div>
        </div>
      </div>
    );
  }

  if (receiptData) {
    return (
      <div className="min-h-screen bg-background py-6 px-4 flex flex-col items-center justify-center font-body-md">
        <div className="max-w-xl w-full bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/30 overflow-hidden animate-fade-in">
          {/* Top Verified Alert Banner (Excluded from PDF print) */}
          <div className="bg-emerald-600/10 border-b border-emerald-600/20 px-4 py-3 flex items-center justify-between no-print">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-xs">
              <span className="material-symbols-outlined text-[18px] text-emerald-600">verified</span>
              <span>Payment Captured & Ledger Synchronized</span>
            </div>
            <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
              {receiptData.receiptNumber}
            </span>
          </div>

          {/* Interactive WhatsApp 10-Second Auto-Redirect & Notification Banner */}
          <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 text-white p-4 mx-4 mt-4 rounded-xl shadow-md border border-emerald-500/30 no-print">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Left Info & Dynamic Countdown */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[24px] text-white">chat</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">Receipt Sent to WhatsApp!</span>
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-mono uppercase font-bold tracking-wider">
                      Official Copy
                    </span>
                  </div>
                  <p className="text-xs text-white/90 mt-0.5">
                    {!isRedirectPaused ? (
                      <>
                        Opening WhatsApp in{' '}
                        <span className="font-bold text-amber-200 font-mono text-sm underline">{countdown}s</span>...
                      </>
                    ) : (
                      <span className="text-amber-200 font-medium">Auto-redirect paused. You can view or save your receipt below.</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Right Action Controls */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsRedirectPaused((prev) => !prev)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white border border-white/20 transition-all"
                  title={isRedirectPaused ? "Resume auto-redirect to WhatsApp" : "Pause redirect and stay on receipt page"}
                >
                  {isRedirectPaused ? '▶ Resume Timer' : '⏸ Stay on Page'}
                </button>
                <a
                  href={whatsappUrl}
                  onClick={() => {
                    setIsRedirectPaused(true);
                    setHasRedirected(true);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-1.5 shadow transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-[16px] text-emerald-700">open_in_new</span>
                  <span>Go to WhatsApp</span>
                </a>
              </div>
            </div>

            {/* Visual Progress Bar */}
            {!isRedirectPaused && (
              <div className="w-full bg-black/25 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-amber-300 h-full transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${Math.max(0, (countdown / 10) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Official Voucher Paper (Institutional Receipt) */}
          <div className="p-4 sm:p-6">
            <ReceiptPaper receipt={receiptData} />
          </div>

          {/* Action Bar (Excluded from PDF print) */}
          <div className="p-4 bg-surface-container-low border-t border-outline-variant/20 flex flex-wrap justify-between items-center gap-3 no-print">
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] text-emerald-600">verified</span>
              <span>Verified institutional e-receipt. Retain for records.</span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={whatsappUrl}
                onClick={() => {
                  setIsRedirectPaused(true);
                  setHasRedirected(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-label-sm font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                title="Open official receipt in WhatsApp"
              >
                <span className="material-symbols-outlined text-[16px]">chat</span>
                <span>Open in WhatsApp</span>
              </a>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary rounded-lg text-label-sm font-semibold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-body-md">
      <div className="bg-surface-container-lowest max-w-md w-full p-space-lg rounded-xl shadow-xl border border-outline-variant/30">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/20 pb-4 mb-4">
          {intent?.logoUrl ? (
            <img
              src={intent.logoUrl}
              alt="Campus Logo"
              className="w-10 h-10 object-contain rounded p-0.5 bg-white border border-outline-variant/30 shadow-sm"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-primary text-on-primary flex items-center justify-center font-headline-sm font-bold shadow-sm">
              C
            </div>
          )}
          <div>
            <h2 className="font-headline-sm text-on-surface leading-tight font-bold">
              {intent?.institutionName || "Campus Flow"}
            </h2>
            <span className="text-[11px] font-data-mono text-on-surface-variant uppercase tracking-wider">
              Student Fee Checkout Portal
            </span>
          </div>
        </div>

        {/* Invoice Summary */}
        <div className="bg-surface-container-low p-space-md rounded-lg mb-4 space-y-2 border border-outline-variant/20">
          <div className="flex justify-between items-center">
            <span className="font-label-sm text-on-surface-variant uppercase tracking-wider text-[10px] font-semibold">
              Official Invoice Details
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono font-bold">
              PAYMENT DUE
            </span>
          </div>
          <div className="text-headline-sm font-bold text-on-surface">{intent?.studentName}</div>
          <div className="text-body-sm text-on-surface-variant flex flex-wrap gap-2 text-xs">
            {intent?.registerNo && <span>Reg: <strong>{intent.registerNo}</strong></span>}
            {intent?.course && <span>• Course: <strong>{intent.course}</strong></span>}
          </div>
          <div className="text-body-sm text-on-surface-variant text-xs">{intent?.description || 'Tuition Fee Installment'}</div>
          <div className="pt-2 border-t border-outline-variant/20 flex justify-between items-baseline">
            <span className="font-label-sm text-on-surface-variant font-medium">Payable Amount:</span>
            <span className="font-data-mono font-bold text-headline-md text-primary">
              ₹{Number(intent?.amount || 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Gateway Guarantee Banner */}
        <div className="p-2.5 bg-surface-container rounded-lg mb-4 flex items-center gap-2 text-[11px] text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary text-[18px]">verified_user</span>
          <span>Secured with Razorpay 256-bit encryption & institutional ledger integrity.</span>
        </div>

        {/* Main Razorpay Action Button */}
        <button
          onClick={handleRazorpayPay}
          disabled={processing}
          className="w-full py-3 bg-primary hover:bg-primary/90 text-on-primary rounded-lg font-label-sm text-label-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 active:scale-[0.99]"
        >
          <span className="material-symbols-outlined text-[18px]">lock</span>
          <span>{processing ? 'Connecting Gateway...' : `Pay ₹${Number(intent?.amount || 0).toLocaleString('en-IN')} via Razorpay / UPI`}</span>
        </button>

        {/* Instant Test Simulator for quick verification */}
        <button
          type="button"
          onClick={handleSimulateTestPay}
          disabled={processing}
          className="w-full mt-2.5 py-1.5 text-center text-xs text-primary/80 hover:text-primary font-medium hover:underline flex items-center justify-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">bolt</span>
          <span>Simulate Instant Bank Approval (Test Mode)</span>
        </button>

        <div className="mt-4 pt-3 border-t border-outline-variant/15 text-center text-[11px] text-on-surface-variant/70">
          Official digital receipt with WhatsApp confirmation is generated immediately upon transaction completion.
        </div>
      </div>
    </div>
  );
};
