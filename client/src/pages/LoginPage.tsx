import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
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

  // Password Reset / Forgot Password State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [forgotCooldown, setForgotCooldown] = useState(60);
  const [canResendForgot, setCanResendForgot] = useState(false);

  // Countdown timer for forgot password OTP resend
  useEffect(() => {
    let timer: any;
    if (showForgotPassword && forgotStep === 'OTP' && forgotCooldown > 0) {
      timer = setInterval(() => {
        setForgotCooldown((prev) => {
          if (prev <= 1) {
            setCanResendForgot(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showForgotPassword, forgotStep, forgotCooldown]);

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

  // Handle Dispatching Forgot Password OTP
  const handleSendForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    if (!forgotEmail.trim()) {
      setForgotError('Please enter your registered work email.');
      return;
    }

    try {
      setForgotLoading(true);
      await api.sendForgotPasswordOtp(forgotEmail.trim().toLowerCase());
      setForgotStep('OTP');
      setForgotOtp('');
      setNewPassword('');
      setConfirmNewPassword('');
      setForgotCooldown(60);
      setCanResendForgot(false);
    } catch (err: any) {
      setForgotError(err?.message || 'Failed to dispatch password reset code.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Handle Verifying OTP & Setting New Password
  const handleVerifyAndResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    if (!forgotOtp || forgotOtp.trim().length !== 6) {
      setForgotError('Please enter the complete 6-digit security code.');
      return;
    }
    if (newPassword.length < 6) {
      setForgotError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setForgotError('Passwords do not match.');
      return;
    }

    try {
      setForgotLoading(true);
      await api.resetPassword({
        email: forgotEmail.trim().toLowerCase(),
        otp: forgotOtp.trim(),
        newPassword
      });

      setForgotSuccess('Password successfully reset! You can now sign in with your new password.');
      setEmail(forgotEmail.trim());
      setPassword('');
      setTimeout(() => {
        setShowForgotPassword(false);
        setForgotSuccess(null);
        setForgotStep('EMAIL');
      }, 2000);
    } catch (err: any) {
      setForgotError(err?.message || 'Failed to reset password. Please check your verification code.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Handle Resending Reset Code
  const handleResendForgot = async () => {
    if (!canResendForgot || forgotLoading) return;
    try {
      setForgotLoading(true);
      setForgotError(null);
      await api.sendForgotPasswordOtp(forgotEmail.trim().toLowerCase());
      setForgotCooldown(60);
      setCanResendForgot(false);
    } catch (err: any) {
      setForgotError(err?.message || 'Could not resend reset code.');
    } finally {
      setForgotLoading(false);
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
              Backend cannot connect to MongoDB. Please ensure MONGODB_URI is configured and network access is open.
            </p>
          </div>
        </div>
      )}

      {/* Setup Required Notice Banner if system is fresh */}
      {isSetupRequired && !otpRequired && !showForgotPassword && (
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

      {/* Main Card */}
      <div className="w-full max-w-md bg-white/95 backdrop-blur-2xl rounded-3xl border border-slate-200/80 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.12)] p-7 sm:p-9 relative z-10 transition-all">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-blue-500/25 mb-3 tracking-tight">
            {showForgotPassword ? (
              <span className="material-symbols-outlined text-[28px]">lock_reset</span>
            ) : (
              'A'
            )}
          </div>
          <div className="flex items-center gap-2 justify-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {showForgotPassword
                ? (forgotStep === 'EMAIL' ? 'Reset Password' : 'Verify & Set Password')
                : (otpRequired ? 'Security Verification' : 'AlphaXync')}
            </h1>
            {!otpRequired && !showForgotPassword && (
              <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 font-mono text-[10px] font-bold uppercase tracking-wider">
                Beta
              </span>
            )}
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-1 max-w-xs">
            {showForgotPassword
              ? (forgotStep === 'EMAIL'
                  ? 'Enter your registered work email to receive a password reset code'
                  : `Enter the 6-digit code sent to ${forgotEmail} and your new password`)
              : (otpRequired
                  ? `First-time verification code sent to ${email}`
                  : 'Autonomous Institutional Operations & Protected Ledger')}
          </p>
        </div>

        {/* FORGOT PASSWORD FLOW */}
        {showForgotPassword ? (
          <div className="space-y-4 animate-fade-in">
            {/* Success message */}
            {forgotSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-2.5 text-sm animate-fade-in shadow-sm">
                <span className="material-symbols-outlined text-emerald-600 text-[20px] shrink-0 mt-0.5">check_circle</span>
                <div className="flex-1 font-medium leading-relaxed">{forgotSuccess}</div>
              </div>
            )}

            {/* Error message */}
            {forgotError && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 flex items-start gap-2.5 text-sm animate-shake shadow-sm">
                <span className="material-symbols-outlined text-[20px] text-rose-600 shrink-0 mt-0.5">error</span>
                <div className="flex-1 font-medium leading-relaxed">{forgotError}</div>
                <button
                  type="button"
                  onClick={() => setForgotError(null)}
                  className="text-rose-400 hover:text-rose-700 p-0.5 rounded border-0 outline-none focus:outline-none cursor-pointer bg-transparent"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Step 1: Enter Email */}
            {forgotStep === 'EMAIL' && (
              <form onSubmit={handleSendForgotOtp} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Account Email Address
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px]">mail</span>
                    <input
                      type="email"
                      required
                      autoComplete="off"
                      placeholder="Enter your registered work email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-emerald-600">verified</span>
                    <span>A 6-digit code will be sent to verify your identity.</span>
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer border-0 outline-none"
                >
                  {forgotLoading ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      <span>Dispatching Code via Resend...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Reset Code</span>
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </>
                  )}
                </button>

                <div className="text-center pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotError(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors cursor-pointer border-0 outline-none bg-transparent"
                  >
                    <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                    <span>Back to Sign In</span>
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Enter OTP & New Password */}
            {forgotStep === 'OTP' && (
              <form onSubmit={handleVerifyAndResetPassword} className="space-y-4">
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 text-center">
                  <span className="material-symbols-outlined text-blue-600 text-[28px] mb-0.5">mark_email_read</span>
                  <p className="text-xs text-slate-500">Security code sent to:</p>
                  <p className="font-semibold text-sm text-slate-900 font-mono mt-0.5">{forgotEmail}</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider text-center mb-1.5">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    autoFocus
                    required
                    autoComplete="off"
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="• • • • • •"
                    className="w-full h-13 text-center text-2xl font-mono font-bold tracking-[8px] rounded-2xl bg-slate-50 border-2 border-blue-500/40 focus:border-blue-600 text-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                  />
                  <div className="flex items-center justify-between text-xs mt-1.5 px-1">
                    <span className="text-[11px] text-slate-500">Code valid 10 mins</span>
                    <button
                      type="button"
                      onClick={handleResendForgot}
                      disabled={!canResendForgot || forgotLoading}
                      className={`font-semibold cursor-pointer border-0 outline-none bg-transparent transition-colors ${
                        canResendForgot ? 'text-blue-600 hover:underline' : 'text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {canResendForgot ? 'Resend Code' : `Resend in ${forgotCooldown}s`}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    New Password (min 6 chars)
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px]">lock</span>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full h-11 pl-10 pr-10 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((p) => !p)}
                      className="absolute right-2.5 text-slate-400 hover:text-slate-700 p-1.5 border-0 bg-transparent flex items-center justify-center cursor-pointer outline-none focus:outline-none focus:ring-0"
                      title={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      <span className="material-symbols-outlined text-[19px]">
                        {showNewPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Confirm New Password
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px]">lock_clock</span>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      placeholder="Confirm new password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 text-slate-900 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading || forgotOtp.length !== 6 || newPassword.length < 6}
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer border-0 outline-none mt-2"
                >
                  {forgotLoading ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <span>Reset Password &amp; Sign In</span>
                      <span className="material-symbols-outlined text-[18px]">check</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between text-xs px-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotStep('EMAIL');
                      setForgotError(null);
                    }}
                    className="text-slate-600 hover:text-slate-900 flex items-center gap-1 font-medium cursor-pointer border-0 outline-none bg-transparent"
                  >
                    <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                    <span>Change Email</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotError(null);
                    }}
                    className="text-slate-600 hover:text-blue-600 font-semibold cursor-pointer border-0 outline-none bg-transparent"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* NORMAL SIGN IN & STAFF OTP FLOW */
          <>
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
                      autoComplete="off"
                      placeholder="Enter your work email"
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
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPassword(true);
                        setForgotEmail(email || '');
                        setForgotError(null);
                        setForgotSuccess(null);
                        setForgotStep('EMAIL');
                      }}
                      className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer border-0 outline-none focus:outline-none bg-transparent"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-slate-400 text-[18px]">lock</span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="Enter your password"
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
                        className="text-[11px] text-slate-500 hover:text-blue-600 transition-colors cursor-pointer border-0 outline-none bg-transparent"
                      >
                        Having trouble? Try Visual Picture Challenge
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <CaptchaTriggerCard
                      onTrigger={() => setShowVisualModal(true)}
                      isVerified={Boolean(captchaToken)}
                    />
                    <div className="text-center mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUseVisualCaptcha(false);
                          setCaptchaToken(null);
                        }}
                        className="text-[11px] text-slate-500 hover:text-blue-600 transition-colors cursor-pointer border-0 outline-none bg-transparent"
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
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-center">
                  <span className="material-symbols-outlined text-blue-600 text-[32px] mb-1">mark_email_read</span>
                  <p className="text-xs text-slate-500">
                    First-time login requires email verification.
                  </p>
                  <p className="font-semibold text-sm text-slate-900 font-mono mt-0.5">{email}</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider text-center mb-2">
                    Enter 6-Digit OTP Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    autoFocus
                    required
                    autoComplete="off"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="• • • • • •"
                    className="w-full h-14 text-center text-3xl font-mono font-bold tracking-[10px] rounded-2xl bg-slate-50 border-2 border-blue-500/40 focus:border-blue-600 text-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                  />
                  <p className="text-[11px] text-center text-slate-500 mt-2">
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
                    className="text-slate-600 hover:text-slate-900 flex items-center gap-1 font-medium cursor-pointer border-0 outline-none bg-transparent"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    <span>Back to Sign In</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="text-blue-600 hover:underline font-semibold cursor-pointer border-0 outline-none bg-transparent"
                  >
                    Resend Code
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer border-0 outline-none"
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
          </>
        )}
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
