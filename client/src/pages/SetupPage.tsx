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

  // Form Fields
  const [institutionName, setInstitutionName] = useState('Alpha College');
  const [institutionCode, setInstitutionCode] = useState('ALPHA');
  const [adminName, setAdminName] = useState('Chief Administrator');
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
    <div className="min-h-screen w-full bg-background flex flex-col justify-center items-center px-4 py-12 select-none relative overflow-hidden">
      {/* Decorative ambient background blur */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-8 relative z-10 transition-all">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-on-primary font-bold text-2xl shadow-md shadow-primary/20 mb-3 tracking-tight">
            A
          </div>
          <h1 className="font-headline-sm text-2xl font-bold text-on-surface">
            {step === 'DETAILS' ? 'AlphaXync Initial Setup (Beta)' : 'Verify Administrator Email'}
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {step === 'DETAILS'
              ? 'Configure your institution parameters and master administrator'
              : `A 6-digit security code was dispatched to ${email}`}
          </p>

          {/* Progress Indicator */}
          <div className="flex items-center gap-2 mt-4">
            <span className={`w-8 h-1.5 rounded-full transition-all ${step === 'DETAILS' ? 'bg-primary' : 'bg-primary/40'}`}></span>
            <span className={`w-8 h-1.5 rounded-full transition-all ${step === 'OTP' ? 'bg-primary' : 'bg-outline-variant/40'}`}></span>
          </div>
        </div>

        {/* Success Alert */}
        {success && (
          <div className="mb-6 p-4 rounded-xl bg-secondary-container/30 border border-secondary text-on-surface flex items-start gap-3 text-sm animate-fade-in">
            <span className="material-symbols-outlined text-secondary text-[24px] shrink-0">check_circle</span>
            <div>
              <p className="font-semibold text-secondary">Email Verified & System Initialized!</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Logging you in to the Operations Console...</p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3 rounded-xl bg-error-container/20 border border-error/40 text-error flex items-start gap-2.5 text-sm animate-shake">
            <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
            <div className="flex-1">{error}</div>
            <button type="button" onClick={() => setError(null)} className="text-error/70 hover:text-error">
              ✕
            </button>
          </div>
        )}

        {/* STEP 1: Details Form */}
        {step === 'DETAILS' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Institution Name
                </label>
                <input
                  type="text"
                  required
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  placeholder="e.g. St. Xavier's College"
                  className="w-full h-10.5 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Institution Code
                </label>
                <input
                  type="text"
                  required
                  value={institutionCode}
                  onChange={(e) => setInstitutionCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SXEC"
                  className="w-full h-10.5 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface text-sm font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Admin Full Name
              </label>
              <input
                type="text"
                required
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="e.g. Principal / Operations Dean"
                className="w-full h-10.5 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Admin Work Email (OTP Delivered Here)
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-outline text-[18px]">mail</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@institution.edu or your Gmail"
                  className="w-full h-10.5 pl-10 pr-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                />
              </div>
              <p className="text-[11px] text-on-surface-variant mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-emerald-600">verified</span>
                <span>Protected by Resend Email verification service.</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Password (min 6 chars)
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10.5 px-3 pr-9 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 text-outline hover:text-on-surface p-1 border-0 bg-transparent flex items-center justify-center cursor-pointer outline-none"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10.5 px-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || success}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-on-primary font-semibold text-sm rounded-xl shadow-md shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
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

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={onGoToLogin}
                className="text-xs text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                Already have an initialized account? <span className="font-semibold underline">Back to Login</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Resend Email OTP Verification */}
        {step === 'OTP' && (
          <form onSubmit={handleVerifyOtp} className="space-y-5 animate-fade-in">
            <div className="bg-surface-container-low/70 border border-outline-variant/30 rounded-xl p-4 text-center">
              <span className="material-symbols-outlined text-primary text-[32px] mb-1">mark_email_read</span>
              <p className="text-xs text-on-surface-variant">
                Enter the 6-digit verification code sent to:
              </p>
              <p className="font-semibold text-sm text-on-surface font-mono mt-0.5">{email}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-center mb-2">
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
                className="w-full h-14 text-center text-3xl font-mono font-bold tracking-[10px] rounded-xl bg-surface-container-low border-2 border-primary/40 focus:border-primary text-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all shadow-inner"
              />
              <p className="text-[11px] text-center text-on-surface-variant mt-2">
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
                className="text-on-surface-variant hover:text-on-surface flex items-center gap-1 font-medium cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>Edit Details</span>
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={!canResend || loading}
                className={`font-semibold cursor-pointer transition-colors ${
                  canResend ? 'text-primary hover:underline' : 'text-outline cursor-not-allowed'
                }`}
              >
                {canResend ? 'Resend Code' : `Resend Code in ${resendCooldown}s`}
              </button>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || otp.length !== 6 || success}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-on-primary font-semibold text-sm rounded-xl shadow-md shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
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
          </form>
        )}
      </div>
    </div>
  );
};
