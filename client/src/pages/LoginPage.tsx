import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { VisualCaptchaModal } from '../components/auth/VisualCaptchaModal';
import { CaptchaTriggerCard } from '../components/auth/CaptchaTriggerCard';

interface LoginPageProps {
  onGoToSetup?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onGoToSetup }) => {
  const { login, verifyLoginOtp, isSetupRequired } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CAPTCHA Challenge State
  const [captchaModalOpen, setCaptchaModalOpen] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

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
      setCaptchaModalOpen(true);
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
    <div className="min-h-screen w-full bg-background flex flex-col justify-center items-center px-4 select-none relative overflow-hidden">
      {/* Decorative ambient background blur */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Setup Required Notice Banner if system is fresh */}
      {isSetupRequired && !otpRequired && (
        <div className="w-full max-w-md mb-6 p-4 rounded-xl bg-secondary-container/20 border border-secondary/30 text-on-surface flex items-start gap-3 shadow-sm animate-fade-in">
          <span className="material-symbols-outlined text-secondary text-[22px] shrink-0 mt-0.5">info</span>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-on-surface">Initial Setup Required</p>
            <p className="text-on-surface-variant text-xs mt-0.5">
              No institution administrators are configured yet. Please initialize your institution first.
            </p>
            {onGoToSetup && (
              <button
                type="button"
                onClick={onGoToSetup}
                className="mt-2 text-xs font-semibold text-secondary hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                Initialize Institution Setup →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Login Card */}
      <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-8 relative z-10 transition-all">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-on-primary font-bold text-2xl shadow-md shadow-primary/20 mb-3 tracking-tight">
            A
          </div>
          <div className="flex items-center gap-2 justify-center">
            <h1 className="font-headline-sm text-2xl font-bold text-on-surface">
              {otpRequired ? 'Security Verification' : 'AlphaXync'}
            </h1>
            {!otpRequired && (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-primary font-data-mono text-[10px] font-bold uppercase tracking-wider">
                Beta
              </span>
            )}
          </div>
          <p className="text-on-surface-variant text-sm mt-1">
            {otpRequired
              ? `First-time verification code sent to ${email}`
              : 'Autonomous Institutional Operations & Protected Ledger (Beta Release)'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-error-container/20 border border-error/40 text-error flex items-start gap-2.5 text-sm animate-shake">
            <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
            <div className="flex-1">{error}</div>
            <button type="button" onClick={() => setError(null)} className="text-error/70 hover:text-error cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* Normal Login Form */}
        {!otpRequired ? (
          <form onSubmit={handleSubmit} className="space-y-4.5">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Work Email Address
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-outline text-[18px]">mail</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@institution.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-outline transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-outline text-[18px]">lock</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-surface-container-low border border-outline-variant/40 text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-outline transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 text-outline hover:text-on-surface transition-colors cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Visual Grid CAPTCHA Security Card */}
            <CaptchaTriggerCard
              isVerified={!!captchaToken}
              onTrigger={() => setCaptchaModalOpen(true)}
              disabled={loading}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed mt-2 cursor-pointer active:scale-98"
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
        <div className="mt-8 pt-6 border-t border-outline-variant/20 flex flex-col items-center gap-2 text-center text-xs text-on-surface-variant">
          {onGoToSetup && !otpRequired ? (
            <div>
              <span>First time setup? </span>
              <button
                type="button"
                onClick={onGoToSetup}
                className="text-primary font-semibold hover:underline cursor-pointer"
              >
                Initialize Institution Admin
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5 text-[11px] text-outline mt-1">
            <span className="material-symbols-outlined text-[14px]">lock_clock</span>
            <span>Secured with Resend OTP Multi-Factor Verification</span>
          </div>
        </div>
      </div>

      {/* Visual Grid CAPTCHA Modal */}
      <VisualCaptchaModal
        isOpen={captchaModalOpen}
        onClose={() => setCaptchaModalOpen(false)}
        onSuccess={(token) => {
          setCaptchaToken(token);
          setError(null);
        }}
      />
    </div>
  );
};
