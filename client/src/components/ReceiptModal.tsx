import React, { useState, useEffect } from 'react';
import { useAuth, type ReceiptSettings } from '../contexts/AuthContext';
import { api } from '../lib/api';

export interface ReceiptData {
  receiptNumber: string;
  studentName: string;
  registerNo: string;
  course?: string;
  department?: string;
  amount: number;
  paymentMethod: string;
  transactionReference?: string;
  date?: string | Date;
  balanceRemaining?: number;
  totalFee?: number;
  notes?: string;
  logoUrl?: string;
  institutionName?: string;
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  headerTitleSize: 20,
  headerTitleColor: '#111827',
  headerSubtitleText: 'Institutional Operations & Accounts Department',
  headerSubtitleSize: 12,
  headerSubtitleColor: '#4b5563',
  badgeText: 'FEE COLLECTION VOUCHER / OFFICIAL RECEIPT',
  headerLogoSize: 44,
  headerLogoPosition: 'inline',
  showWatermark: true,
  watermarkCustomUrl: '',
  watermarkSize: 280,
  watermarkOpacity: 0.10,
  watermarkRotation: -12,
  watermarkGrayscale: true,
  bodyFontSize: 12,
  primaryColor: '#1e40af',
  textColor: '#1f2937',
  footerNotes: '• Computer generated official receipt.\n• Verified against institutional ledger.',
  signatoryLabel: 'Authorized Signatory',
  showSignatoryLine: true
};

export interface ReceiptPaperProps {
  receipt: ReceiptData;
  customSettings?: ReceiptSettings;
  className?: string;
}

export const ReceiptPaper: React.FC<ReceiptPaperProps> = ({ receipt, customSettings, className = '' }) => {
  const { institution } = useAuth();
  const [fetchedInst, setFetchedInst] = useState<{ name?: string; logoUrl?: string; receiptSettings?: ReceiptSettings } | null>(null);

  useEffect(() => {
    if (!receipt?.logoUrl && !institution?.logoUrl) {
      api.getSettings().then((res: any) => {
        if (res?.institution) {
          setFetchedInst({
            name: res.institution.name,
            logoUrl: res.institution.logoUrl,
            receiptSettings: res.institution.receiptSettings
          });
        }
      }).catch(() => {});
    }
  }, [receipt?.logoUrl, institution?.logoUrl]);

  const activeSettings: ReceiptSettings = {
    ...DEFAULT_RECEIPT_SETTINGS,
    ...(institution?.receiptSettings || {}),
    ...(fetchedInst?.receiptSettings || {}),
    ...(customSettings || {})
  };

  const institutionTitle = receipt.institutionName || institution?.name || fetchedInst?.name || "Official Campus Receipt";
  const logoUrl = receipt.logoUrl || institution?.logoUrl || fetchedInst?.logoUrl;
  const watermarkUrl = activeSettings.watermarkCustomUrl || logoUrl;

  const formattedDate = receipt.date
    ? new Date(receipt.date).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

  return (
    <div
      id="printable-receipt"
      className={`relative p-6 bg-white select-none font-sans overflow-hidden border border-gray-200 rounded shadow-sm ${className}`}
      style={{
        fontSize: `${activeSettings.bodyFontSize}px`,
        color: activeSettings.textColor,
        minHeight: '480px'
      }}
    >
      {/* Center Watermark Emblem (Anti-forgery official seal) */}
      {activeSettings.showWatermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden">
          {watermarkUrl ? (
            <img
              src={watermarkUrl}
              alt="Watermark"
              style={{
                width: `${activeSettings.watermarkSize}px`,
                height: `${activeSettings.watermarkSize}px`,
                opacity: activeSettings.watermarkOpacity,
                transform: `rotate(${activeSettings.watermarkRotation}deg)`,
                filter: activeSettings.watermarkGrayscale ? 'grayscale(100%) contrast(125%)' : 'contrast(110%)'
              }}
              className="object-contain transition-all"
            />
          ) : (
            <div
              style={{
                width: `${activeSettings.watermarkSize}px`,
                height: `${activeSettings.watermarkSize}px`,
                opacity: activeSettings.watermarkOpacity,
                transform: `rotate(${activeSettings.watermarkRotation}deg)`
              }}
              className="rounded-full border-8 border-gray-900 flex flex-col items-center justify-center transition-all"
            >
              <span className="font-serif font-black text-3xl tracking-widest text-gray-900">CAMPUS</span>
              <span className="text-[10px] font-bold tracking-widest uppercase text-gray-900 mt-1">OFFICIAL SEAL</span>
            </div>
          )}
        </div>
      )}

      <div className="relative z-10">
        {/* Institution Header */}
        <div
          className="text-center pb-3 mb-4"
          style={{ borderBottom: `2px solid ${activeSettings.primaryColor || '#111827'}` }}
        >
          {activeSettings.headerLogoPosition === 'stacked' ? (
            <div className="flex flex-col items-center justify-center gap-1.5 mb-1.5">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Campus Logo"
                  style={{
                    width: `${activeSettings.headerLogoSize}px`,
                    height: `${activeSettings.headerLogoSize}px`
                  }}
                  className="object-contain rounded shadow-sm bg-white p-0.5 border border-gray-200 shrink-0"
                />
              ) : (
                <span
                  style={{
                    width: `${activeSettings.headerLogoSize}px`,
                    height: `${activeSettings.headerLogoSize}px`
                  }}
                  className="rounded bg-blue-700 text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0"
                >
                  CF
                </span>
              )}
              <h2
                className="font-bold uppercase tracking-wide leading-tight px-2"
                style={{
                  fontSize: `${activeSettings.headerTitleSize}px`,
                  color: activeSettings.headerTitleColor
                }}
              >
                {institutionTitle}
              </h2>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2.5 mb-1.5">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Campus Logo"
                  style={{
                    width: `${activeSettings.headerLogoSize}px`,
                    height: `${activeSettings.headerLogoSize}px`
                  }}
                  className="object-contain rounded shadow-sm bg-white p-0.5 border border-gray-200 shrink-0"
                />
              ) : (
                <span
                  style={{
                    width: `${activeSettings.headerLogoSize}px`,
                    height: `${activeSettings.headerLogoSize}px`
                  }}
                  className="rounded bg-blue-700 text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0"
                >
                  CF
                </span>
              )}
              <h2
                className="font-bold uppercase tracking-wide leading-tight"
                style={{
                  fontSize: `${activeSettings.headerTitleSize}px`,
                  color: activeSettings.headerTitleColor
                }}
              >
                {institutionTitle}
              </h2>
            </div>
          )}

          {activeSettings.headerSubtitleText && (
            <p
              style={{
                fontSize: `${activeSettings.headerSubtitleSize}px`,
                color: activeSettings.headerSubtitleColor
              }}
              className="mt-0.5 font-medium"
            >
              {activeSettings.headerSubtitleText}
            </p>
          )}

          {activeSettings.badgeText && (
            <div
              className="inline-block mt-1 px-3 py-0.5 rounded bg-gray-50 border text-[11px] font-mono font-bold tracking-widest uppercase shadow-2xs"
              style={{ borderColor: activeSettings.primaryColor }}
            >
              {activeSettings.badgeText}
            </div>
          )}
        </div>

        {/* Receipt Top Info */}
        <div className="flex justify-between items-center text-xs border-b border-gray-200 pb-2 mb-3">
          <div>
            <span className="text-gray-500">Receipt No: </span>
            <span
              className="font-mono font-bold text-sm"
              style={{ color: activeSettings.primaryColor }}
            >
              {receipt.receiptNumber}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Date: </span>
            <span className="font-mono font-semibold text-gray-800">{formattedDate}</span>
          </div>
        </div>

        {/* Student Details Grid */}
        <div className="bg-gray-50/80 rounded p-3 mb-4 border border-gray-200 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500 block text-[10px] uppercase tracking-wider">Student Name</span>
            <span className="font-bold text-gray-900 text-sm">{receipt.studentName}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-[10px] uppercase tracking-wider">Register / Roll No</span>
            <span className="font-mono font-semibold text-gray-900 text-sm">{receipt.registerNo}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-[10px] uppercase tracking-wider">Course / Degree</span>
            <span className="text-gray-800 font-medium">{receipt.course || 'BCA / Engineering'}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-[10px] uppercase tracking-wider">Department</span>
            <span className="text-gray-800 font-medium">{receipt.department || 'General'}</span>
          </div>
        </div>

        {/* Payment Details Table */}
        <table className="w-full text-xs border-collapse border border-gray-300 mb-4">
          <thead>
            <tr className="bg-gray-100 text-gray-700">
              <th className="border border-gray-300 p-2 text-left font-semibold">Description</th>
              <th className="border border-gray-300 p-2 text-center font-semibold">Payment Mode</th>
              <th className="border border-gray-300 p-2 text-right font-semibold">Amount Paid</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">
                Tuition Fee Installment
                {receipt.transactionReference && (
                  <span className="block text-[10px] text-gray-500 font-mono">
                    Ref: {receipt.transactionReference}
                  </span>
                )}
              </td>
              <td className="border border-gray-300 p-2 text-center font-sans font-semibold">
                {receipt.paymentMethod === 'UPI' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold text-[11px] border border-purple-200 shadow-xs">
                    <span>📱</span> UPI / QR (GPay/Paytm)
                  </span>
                ) : receipt.paymentMethod === 'CASH' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold text-[11px] border border-amber-200 shadow-xs">
                    <span>🏢</span> On-Spot Counter Cash
                  </span>
                ) : receipt.paymentMethod === 'RAZORPAY' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold text-[11px] border border-blue-200 shadow-xs">
                    <span>🌐</span> Online (Razorpay)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 text-gray-700 font-semibold text-[11px] border border-gray-200 shadow-xs">
                    <span>💳</span> {receipt.paymentMethod || 'CASH'}
                  </span>
                )}
              </td>
              <td className="border border-gray-300 p-2 text-right font-mono font-bold text-emerald-700 text-sm">
                ₹{Number(receipt.amount).toLocaleString('en-IN')}
              </td>
            </tr>
          </tbody>
          <tfoot>
            {receipt.balanceRemaining !== undefined && (
              <tr className="bg-gray-50">
                <td colSpan={2} className="border border-gray-300 p-2 text-right font-semibold text-gray-600">
                  Remaining Outstanding Balance:
                </td>
                <td className="border border-gray-300 p-2 text-right font-mono font-bold text-red-600">
                  ₹{Number(receipt.balanceRemaining).toLocaleString('en-IN')}
                </td>
              </tr>
            )}
          </tfoot>
        </table>

        {/* Dynamic Next Payment QR or Full Settlement Clearance */}
        {receipt.balanceRemaining !== undefined && receipt.balanceRemaining > 0 ? (
          <div className="mb-4 p-2.5 rounded bg-slate-50 border border-dashed border-slate-300 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                <span>📲</span>
                <span>Next Installment QR & Online Pay Link</span>
              </div>
              <p className="text-[10px] text-slate-600 mt-0.5">
                Scan with any UPI app (GPay / PhonePe / Paytm) to pay remaining ₹{Number(receipt.balanceRemaining).toLocaleString('en-IN')}
              </p>
              <p className="text-[9px] text-blue-600 font-mono mt-1 underline">
                http://xync.alphaprime.co.in/pay?reg={receipt.registerNo}
              </p>
            </div>
            <div className="w-16 h-16 bg-white p-1 rounded border border-slate-200 shrink-0 shadow-xs">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=alphaxync@upi&pn=AlphaXync&am=${receipt.balanceRemaining}&cu=INR&tn=${receipt.registerNo}_BAL`)}`}
                alt="Next Payment QR"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        ) : receipt.balanceRemaining === 0 ? (
          <div className="mb-4 p-2 rounded bg-emerald-50 border border-emerald-300 flex items-center gap-2 text-emerald-800">
            <span className="text-base">🏆</span>
            <div className="text-[11px] font-semibold">
              Official Clearance: All prescribed fee dues for this term are 100% settled and cleared (Nil Balance).
            </div>
          </div>
        ) : null}

        {/* Footer & Signature */}
        <div className="flex justify-between items-end pt-4 mt-4 border-t border-gray-200 text-xs">
          <div className="text-[10px] text-gray-500 leading-relaxed">
            {activeSettings.footerNotes?.split('\n').map((line, idx) => (
              <p key={idx}>{line}</p>
            ))}
          </div>
          <div className="text-center">
            {activeSettings.showSignatoryLine && (
              <div className="w-32 border-b border-gray-400 mb-1"></div>
            )}
            <span className="text-[11px] font-semibold text-gray-700 uppercase">
              {activeSettings.signatoryLabel || 'Authorized Signatory'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  customSettings?: ReceiptSettings;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, customSettings, onClose }) => {
  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest max-w-lg w-full rounded-xl shadow-2xl border border-outline-variant/30 overflow-hidden animate-fade-in">
        {/* Printable Card Area */}
        <ReceiptPaper receipt={receipt} customSettings={customSettings} />

        {/* Action Buttons (Excluded from Print) */}
        <div className="p-3 bg-surface-container-low border-t border-outline-variant/20 flex justify-end gap-2 no-print">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-surface-container hover:bg-surface-container-high rounded text-label-sm text-on-surface transition-colors font-medium"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-on-primary rounded text-label-sm font-semibold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
