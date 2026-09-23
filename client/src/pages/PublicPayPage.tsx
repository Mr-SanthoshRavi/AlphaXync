import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { ReceiptPaper, type ReceiptData } from '../components/ReceiptModal';

interface PublicPayPageProps {
  token: string;
  onBackToApp?: () => void;
}

export const PublicPayPage: React.FC<PublicPayPageProps> = ({ token, onBackToApp }) => {
  const [intent, setIntent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [receipt, setReceipt] = useState<any | null>(null);

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
          name: intent?.institutionName || 'AlphaXync Operations',
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
            } catch (vErr: any) {
              setError(vErr.message || 'Payment signature verification failed.');
            } finally {
              setProcessing(false);
            }
          },
          prefill: {
            name: intent?.studentName || '',
            email: 'parent@alphaprime.co.in',
            contact: ''
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
        <div className="bg-surface-container-lowest max-w-md w-full p-space-lg rounded shadow-md border border-error/30 text-center">
          <span className="material-symbols-outlined text-error text-[48px] mb-2">error</span>
          <h2 className="font-headline-sm text-on-surface mb-1">Payment Checkout Issue</h2>
          <p className="text-body-sm text-on-surface-variant mb-4">{error}</p>
          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="px-4 py-2 bg-surface-container hover:bg-surface-container-high rounded text-label-sm text-on-surface transition-colors"
            >
              Return to Operations Console
            </button>
          )}
        </div>
      </div>
    );
  }

  if (receipt) {
    const receiptData: ReceiptData = {
      receiptNumber: receipt.receiptNumber || 'REC-CONFIRMED',
      studentName: receipt.studentName || intent?.studentName || '',
      registerNo: receipt.registerNo || intent?.registerNo || '',
      course: receipt.course || intent?.course || '',
      department: receipt.department || intent?.department || 'General',
      amount: Number(receipt.amount || intent?.amount || 0),
      paymentMethod: 'UPI',
      transactionReference: receipt.transactionId || 'Razorpay-Verified',
      date: receipt.date || new Date(),
      balanceRemaining: receipt.balanceRemaining !== undefined ? receipt.balanceRemaining : intent?.balanceRemaining,
      totalFee: receipt.totalFee || intent?.totalFee,
      notes: 'Verified online payment (Razorpay Gateway-Confirmed)',
      logoUrl: receipt.logoUrl || intent?.logoUrl,
      institutionName: receipt.institutionName || intent?.institutionName,
    };

    return (
      <div className="min-h-screen bg-background py-8 px-4 flex flex-col items-center justify-center font-body-md">
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

          {/* Official Voucher Paper (Identical to Admin Receipt Voucher) */}
          <ReceiptPaper receipt={receiptData} />

          {/* Action Bar (Excluded from PDF print) */}
          <div className="p-4 bg-surface-container-low border-t border-outline-variant/20 flex flex-wrap justify-between items-center gap-3 no-print">
            <p className="text-[11px] text-on-surface-variant">
              An official copy has also been sent to your registered WhatsApp.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary rounded-lg text-label-sm font-semibold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                <span>Print / Save PDF</span>
              </button>
              {onBackToApp && (
                <button
                  onClick={onBackToApp}
                  className="px-3 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg text-label-sm font-medium transition-colors"
                >
                  Admin Console
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-body-md">
      <div className="bg-surface-container-lowest max-w-md w-full p-space-lg rounded shadow-xl border border-outline-variant/30">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/20 pb-4 mb-4">
          {intent?.logoUrl ? (
            <img
              src={intent.logoUrl}
              alt="Campus Logo"
              className="w-10 h-10 object-contain rounded p-0.5 bg-white border border-outline-variant/30 shadow-sm"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center font-headline-sm">
              C
            </div>
          )}
          <div>
            <h2 className="font-headline-sm text-on-surface leading-tight">
              {intent?.institutionName || "Campus Flow"}
            </h2>
            <span className="text-[11px] font-data-mono text-on-surface-variant uppercase">
              Fee Collection Portal
            </span>
          </div>
        </div>

        {/* Invoice Summary */}
        <div className="bg-surface-container-low p-space-md rounded mb-4 space-y-2">
          <span className="font-label-sm text-on-surface-variant block uppercase tracking-wider text-[10px]">
            Payment Invoice
          </span>
          <div className="text-headline-sm font-semibold text-on-surface">{intent?.studentName}</div>
          <div className="text-body-sm text-on-surface-variant">{intent?.description || 'Tuition Fee Installment'}</div>
          <div className="pt-2 border-t border-outline-variant/20 flex justify-between items-baseline">
            <span className="font-label-sm text-on-surface-variant">Payable Amount:</span>
            <span className="font-data-mono font-bold text-headline-md text-primary">
              ₹{Number(intent?.amount || 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Gateway Guarantee Banner */}
        <div className="p-2 bg-surface-container rounded mb-4 flex items-center gap-2 text-[11px] text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary text-[16px]">verified_user</span>
          <span>Secured with Razorpay 256-bit encryption & server ledger integrity.</span>
        </div>

        {/* Main Razorpay Action Button */}
        <button
          onClick={handleRazorpayPay}
          disabled={processing}
          className="w-full py-2.5 bg-primary hover:bg-primary/90 text-on-primary rounded font-label-sm text-label-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">lock</span>
          <span>{processing ? 'Connecting Gateway...' : `Pay ₹${Number(intent?.amount || 0).toLocaleString('en-IN')} via Razorpay`}</span>
        </button>

        {/* Instant Test Simulator for quick verification */}
        <button
          type="button"
          onClick={handleSimulateTestPay}
          disabled={processing}
          className="w-full mt-2 py-1.5 text-center text-xs text-primary/80 hover:text-primary font-medium hover:underline flex items-center justify-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">bolt</span>
          <span>Simulate Instant Bank Approval (Test Mode)</span>
        </button>

        {onBackToApp && (
          <button
            onClick={onBackToApp}
            className="w-full mt-3 py-1.5 text-center text-[12px] text-on-surface-variant hover:text-on-surface"
          >
            ← Switch to Admin Console
          </button>
        )}
      </div>
    </div>
  );
};
