import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface SetupPageProps {
  onGoToLogin: () => void;
}

export const SetupPage: React.FC<SetupPageProps> = ({ onGoToLogin }) => {
  const { refreshAuth } = useAuth();

  // Step State: 'DETAILS' -> 'OTP'
  const [step, setStep] = useState<'DETAILS' | 'OTP'>('DETAILS');

  // Form Fields (Empty by default with clean placeholders)
  const [institutionName, setInstitutionName] = useState('');
  const [institutionCode, setInstitutionCode] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP Fields
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Resend Countdown Timer
  useEffect(() => {
    let timer: any;
    if (step === 'OTP' && resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, resendCooldown]);

  // Handle Step 1: Send OTP via Resend
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!institutionName.trim() || !institutionCode.trim() || !adminName.trim() || !email.trim()) {
      setError('All fields are required.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      await api.sendSetupOtp({
        institutionName: institutionName.trim(),
        institutionCode: institutionCode.trim().toUpperCase(),
        adminName: adminName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      setStep('OTP');
      setOtp('');
      setResendCooldown(60);
      setCanResend(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch verification email. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Step 2: Verify OTP and Finish Setup
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otp || otp.trim().length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    try {
      setLoading(true);
      await api.verifySetupOtp(email.trim().toLowerCase(), otp.trim());

      setSuccess(true);

      // Auto-refresh auth context to enter dashboard
      setTimeout(async () => {
        await refreshAuth();
      }, 1000);
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResend = async () => {
    if (!canResend || loading) return;
    try {
      setLoading(true);
      setError(null);
      await api.resendSetupOtp(email.trim().toLowerCase());
      setResendCooldown(60);
      setCanResend(false);
    } catch (err: any) {
      setError(err?.message || 'Could not resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col justify-center items-center px-4 py-10 select-none relative overflow-hidden">
      {/* Decorative ambient background blur */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg bg-white/95 backdrop-blur-2xl rounded-3xl border border-slate-200/80 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.12)] p-7 sm:p-9 relative z-10 transition-all">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-blue-500/25 mb-3 tracking-tight">
            A
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {step === 'DETAILS' ? 'AlphaXync Initial Setup' : 'Verify Administrator Email'}
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1 max-w-sm">
            {step === 'DETAILS'
              ? 'Configure your institutional workspace and master administrator'
              : `A 6-digit security code was dispatched to ${email}`}
          </p>

          {/* Progress Indicator */}
          <div className="flex items-center gap-2 mt-4">
            <span className={`h-1.5 rounded-full transition-all duration-300 ${step === 'DETAILS' ? 'w-10 bg-blue-600' : 'w-4 bg-blue-200'}`}></span>
            <span className={`h-1.5 rounded-full transition-all duration-300 ${step === 'OTP' ? 'w-10 bg-blue-600' : 'w-4 bg-slate-200'}`}></span>
          </div>
        </div>

        {/* Success Alert */}
        {success && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-3 text-sm animate-fade-in shadow-sm">
            <span className="material-symbols-outlined text-emerald-600 text-[24px] shrink-0">check_circle</span>
            <div>
              <p className="font-semibold text-emerald-900">Email Verified &amp; System Initialized!</p>
              <p className="text-xs text-emerald-700 mt-0.5">Logging you in to the Operations Console...</p>
            </div>
          </div>
        )}

        {/* Error Alert with Smart Recovery Action */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 flex flex-col gap-2.5 text-sm animate-shake shadow-sm">
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-rose-600 shrink-0 mt-0.5">error</span>
              <div className="flex-1 font-medium leading-relaxed">{error}</div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-rose-400 hover:text-rose-700 p-0.5 rounded border-0 outline-none focus:outline-none cursor-pointer bg-transparent"
              >
                ✕
              </button>
            </div>
            {(error.toLowerCase().includes('already exists') || error.toLowerCase().includes('login')) && (
              <button
                type="button"
                onClick={onGoToLogin}
                className="self-start mt-1 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer active:scale-95 border-0 outline-none"
              >
                <span>Go to Login Now</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            )}
          </div>
        )}

        {/* STEP 1: Details Form */}
        {step === 'DETAILS' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Institution Name
                </label>
                <input
                  type="text"
                  required
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  placeholder="Enter institution name (e.g. Alpha College)"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Institution Code
                </label>
                <input
                  type="text"
                  required
                  value={institutionCode}
                  onChange={(e) => setInstitutionCode(e.target.value.toUpperCase())}
                  placeholder="Enter code (e.g. ALPHA)"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 text-slate-900 text-sm font-mono placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Admin Full Name
              </label>
              <input
                type="text"
                required
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Enter administrator full name"
                className="w-full h-11 px-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Admin Work Email (OTP Delivered Here)
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px]">mail</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter administrator work email"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-emerald-600">verified</span>
                <span>Protected by Resend OTP verification service.</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Password (min 6 chars)
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create password (min 6 chars)"
                    className="w-full h-11 px-3.5 pr-10 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 text-slate-400 hover:text-slate-700 p-1.5 border-0 bg-transparent flex items-center justify-center cursor-pointer outline-none focus:outline-none focus:ring-0"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || success}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer border-0 outline-none"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    <span>Dispatching OTP via Resend...</span>
                  </>
                ) : (
                  <>
                    <span>Continue &amp; Send Verification Code</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-center pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onGoToLogin}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50/70 transition-all border-0 outline-none focus:outline-none focus:ring-0 cursor-pointer appearance-none bg-transparent"
              >
                <span>Already have an initialized account?</span>
                <span className="font-semibold text-blue-600 underline">Back to Login</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Resend Email OTP Verification */}
        {step === 'OTP' && (
          <form onSubmit={handleVerifyOtp} className="space-y-5 animate-fade-in">
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-center">
              <span className="material-symbols-outlined text-blue-600 text-[32px] mb-1">mark_email_read</span>
              <p className="text-xs text-slate-500">
                Enter the 6-digit verification code sent to:
              </p>
              <p className="font-semibold text-sm text-slate-900 font-mono mt-0.5">{email}</p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider text-center mb-2">
                6-Digit Security Code
              </label>
              <input
                type="text"
                maxLength={6}
                autoFocus
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="• • • • • •"
                className="w-full h-14 text-center text-3xl font-mono font-bold tracking-[10px] rounded-2xl bg-slate-50 border-2 border-blue-500/40 focus:border-blue-600 text-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
              />
              <p className="text-[11px] text-center text-slate-500 mt-2">
                ⏱️ Code valid for 10 minutes. Check your Spam folder if not received.
              </p>
            </div>

            <div className="flex items-center justify-between text-xs px-1">
              <button
                type="button"
                onClick={() => {
                  setStep('DETAILS');
                  setError(null);
                }}
                className="text-slate-600 hover:text-slate-900 flex items-center gap-1 font-medium cursor-pointer border-0 outline-none bg-transparent"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>Edit Details</span>
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={!canResend || loading}
                className={`font-semibold cursor-pointer border-0 outline-none bg-transparent transition-colors ${
                  canResend ? 'text-blue-600 hover:underline' : 'text-slate-400 cursor-not-allowed'
                }`}
              >
                {canResend ? 'Resend Code' : `Resend Code in ${resendCooldown}s`}
              </button>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || otp.length !== 6 || success}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer border-0 outline-none"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">verified_user</span>
                    <span>Verify &amp; Activate Institution</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={onGoToLogin}
                className="text-xs text-slate-500 hover:text-blue-600 transition-colors cursor-pointer border-0 outline-none bg-transparent"
              >
                Already have an initialized account? <span className="font-semibold text-blue-600 underline">Back to Login</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
