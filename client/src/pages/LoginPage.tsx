import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GoogleRecaptcha } from '../components/auth/GoogleRecaptcha';
import { VisualCaptchaModal } from '../components/auth/VisualCaptchaModal';
import { CaptchaTriggerCard } from '../components/auth/CaptchaTriggerCard';

interface LoginPageProps {
  onGoToSetup?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onGoToSetup }) => {
  const { login, verifyLoginOtp, isSetupRequired, dbError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Security Verification State
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [useVisualCaptcha, setUseVisualCaptcha] = useState(false);
  const [showVisualModal, setShowVisualModal] = useState(false);

  // First-Time Login OTP State
  const [otpRequired, setOtpRequired] = useState(false);
  const [otp, setOtp] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    if (!captchaToken) {
      setError('Please complete the security verification challenge to proceed.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await login(email.trim(), password, captchaToken);
      if (res?.requiresOtp) {
        setOtpRequired(true);
        setOtp('');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify credentials.');
      if (err?.code === 'CAPTCHA_REQUIRED' || err?.code === 'CAPTCHA_VERIFICATION_FAILED') {
        setCaptchaToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.trim().length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await verifyLoginOtp(email.trim(), otp.trim());
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col justify-center items-center px-4 py-10 select-none relative overflow-hidden">
      {/* Decorative ambient background blur */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Database Connection Alert Banner if cloud database is unreachable */}
      {dbError && (
        <div className="w-full max-w-md mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-3 shadow-sm animate-fade-in">
          <span className="material-symbols-outlined text-amber-600 text-[24px] shrink-0 mt-0.5">database</span>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-amber-900">Database Connection Required</p>
            <p className="text-amber-800 text-xs mt-1 leading-relaxed">
              Vercel backend cannot connect to MongoDB. Please configure <code className="px-1 py-0.5 rounded bg-black/10 font-mono text-[11px]">MONGODB_URI</code> in your Vercel Project Environment Variables and ensure MongoDB Atlas allows <code className="px-1 py-0.5 rounded bg-black/10 font-mono text-[11px]">0.0.0.0/0</code> IP access.
            </p>
          </div>
        </div>
      )}

      {/* Setup Required Notice Banner if system is fresh */}
      {isSetupRequired && !otpRequired && (
        <div className="w-full max-w-md mb-5 p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-950 flex items-start gap-3 shadow-sm animate-fade-in">
          <span className="material-symbols-outlined text-blue-600 text-[22px] shrink-0 mt-0.5">info</span>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-blue-900">Initial Setup Required</p>
            <p className="text-blue-800 text-xs mt-0.5">
              No institution administrators are configured yet. Please initialize your institution first.
            </p>
            {onGoToSetup && (
              <button
                type="button"
                onClick={onGoToSetup}
                className="mt-2 text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer border-0 outline-none bg-transparent"
              >
                Initialize Institution Setup →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Login Card */}
      <div className="w-full max-w-md bg-white/95 backdrop-blur-2xl rounded-3xl border border-slate-200/80 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.12)] p-7 sm:p-9 relative z-10 transition-all">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-blue-500/25 mb-3 tracking-tight">
            A
          </div>
          <div className="flex items-center gap-2 justify-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {otpRequired ? 'Security Verification' : 'AlphaXync'}
            </h1>
            {!otpRequired && (
              <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 font-mono text-[10px] font-bold uppercase tracking-wider">
                Beta
              </span>
            )}
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            {otpRequired
              ? `First-time verification code sent to ${email}`
              : 'Autonomous Institutional Operations & Protected Ledger'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 flex items-start gap-2.5 text-sm animate-shake shadow-sm">
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
        )}

        {/* Normal Login Form */}
        {!otpRequired ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Work Email Address
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px]">mail</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@institution.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px]">lock</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-2.5 text-slate-400 hover:text-slate-700 p-1.5 border-0 bg-transparent flex items-center justify-center cursor-pointer outline-none focus:outline-none focus:ring-0"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined text-[19px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Security Verification: Google reCAPTCHA or Visual Shield Challenge */}
            {!useVisualCaptcha ? (
              <div>
                <GoogleRecaptcha
                  onVerify={(token) => {
                    setCaptchaToken(token);
                    setError(null);
                  }}
                  onExpire={() => setCaptchaToken(null)}
                  onFallbackRequest={() => {
                    setUseVisualCaptcha(true);
                    setShowVisualModal(true);
                  }}
                />
                <div className="text-center mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setUseVisualCaptcha(true);
                      setShowVisualModal(true);
                    }}
                    className="text-[11px] text-outline hover:text-primary transition-colors cursor-pointer"
                  >
                    Having trouble? Use Visual Image Challenge
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 my-2">
                <CaptchaTriggerCard
                  isVerified={Boolean(captchaToken)}
                  onTrigger={() => setShowVisualModal(true)}
                />
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setUseVisualCaptcha(false);
                      setCaptchaToken(null);
                    }}
                    className="text-[11px] text-outline hover:text-primary transition-colors cursor-pointer"
                  >
                    Switch back to Google reCAPTCHA
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer border-0 outline-none mt-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Console</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* First-Time Staff OTP Verification Form */
          <form onSubmit={handleVerifyOtp} className="space-y-5 animate-fade-in">
            <div className="bg-surface-container-low/70 border border-outline-variant/30 rounded-xl p-4 text-center">
              <span className="material-symbols-outlined text-primary text-[32px] mb-1">mark_email_read</span>
              <p className="text-xs text-on-surface-variant">
                First-time login requires email verification.
              </p>
              <p className="font-semibold text-sm text-on-surface font-mono mt-0.5">{email}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-center mb-2">
                Enter 6-Digit OTP Code
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
                Dispatched via Resend. Check your inbox or Spam.
              </p>
            </div>

            <div className="flex items-center justify-between text-xs px-1">
              <button
                type="button"
                onClick={() => {
                  setOtpRequired(false);
                  setError(null);
                }}
                className="text-on-surface-variant hover:text-on-surface flex items-center gap-1 font-medium cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>Back to Sign In</span>
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="text-primary hover:underline font-semibold cursor-pointer"
              >
                Resend Code
              </button>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer active:scale-98"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">verified_user</span>
                    <span>Verify &amp; Enter Console</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer info / Setup link */}
        <div className="mt-7 pt-5 border-t border-slate-100 flex flex-col items-center gap-2 text-center text-xs text-slate-500">
          {onGoToSetup && !otpRequired ? (
            <div>
              <span>First time setup? </span>
              <button
                type="button"
                onClick={onGoToSetup}
                className="text-blue-600 font-semibold hover:underline cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 bg-transparent"
              >
                Initialize Institution Admin
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
            <span className="material-symbols-outlined text-[14px]">lock_clock</span>
            <span>Secured with Resend OTP Multi-Factor Verification</span>
          </div>
        </div>
      </div>

      {/* Visual Captcha Challenge Modal */}
      <VisualCaptchaModal
        isOpen={showVisualModal}
        onClose={() => setShowVisualModal(false)}
        onSuccess={(token) => {
          setCaptchaToken(token);
          setError(null);
          setShowVisualModal(false);
        }}
      />
    </div>
  );
};
