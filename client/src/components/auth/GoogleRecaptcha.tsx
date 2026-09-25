import React, { useEffect, useRef, useState } from 'react';

export interface GoogleRecaptchaRef {
  reset: () => void;
}

interface GoogleRecaptchaProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  siteKey?: string;
  className?: string;
}

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark';
          size?: 'normal' | 'compact';
        }
      ) => number;
      reset: (opt_widget_id?: number) => void;
    };
  }
}

export const GoogleRecaptcha = React.forwardRef<GoogleRecaptchaRef, GoogleRecaptchaProps>(
  (
    {
      onVerify,
      onExpire,
      siteKey = (import.meta as any).env?.VITE_RECAPTCHA_SITE_KEY || '',
      className = ''
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<number | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Keep callbacks in refs so changes never re-trigger useEffect and destroy grecaptcha
    const onVerifyRef = useRef(onVerify);
    onVerifyRef.current = onVerify;

    const onExpireRef = useRef(onExpire);
    onExpireRef.current = onExpire;

    React.useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current !== null && window.grecaptcha?.reset) {
          try {
            window.grecaptcha.reset(widgetIdRef.current);
          } catch (e) {
            console.warn('Error resetting reCAPTCHA widget:', e);
          }
        }
      }
    }));

    useEffect(() => {
      let isMounted = true;
      let intervalId: any = null;

      const renderWidget = () => {
        if (!isMounted || !containerRef.current || widgetIdRef.current !== null) {
          return;
        }

        if (!window.grecaptcha || typeof window.grecaptcha.render !== 'function') {
          return;
        }

        try {
          // Clear any stale nodes inside the container before rendering
          containerRef.current.innerHTML = '';

          const widgetId = window.grecaptcha.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token: string) => {
              if (isMounted) {
                onVerifyRef.current(token);
              }
            },
            'expired-callback': () => {
              if (isMounted && onExpireRef.current) {
                onExpireRef.current();
              }
            },
            'error-callback': () => {
              if (isMounted) {
                setError('Google reCAPTCHA verification error. Please check your network connection.');
              }
            },
            theme: 'light'
          });

          widgetIdRef.current = widgetId;
          if (isMounted) {
            setLoaded(true);
            setError(null);
          }
        } catch (err: any) {
          console.warn('Google reCAPTCHA render caught:', err);
        }
      };

      const initGrecaptcha = () => {
        if (typeof window.grecaptcha?.ready === 'function') {
          window.grecaptcha.ready(renderWidget);
        } else {
          intervalId = setInterval(() => {
            if (typeof window.grecaptcha?.render === 'function') {
              clearInterval(intervalId);
              intervalId = null;
              renderWidget();
            }
          }, 100);
        }
      };

      // Ensure script exists in document
      const scriptId = 'google-recaptcha-v2-script';
      let script = document.getElementById(scriptId) as HTMLScriptElement;

      if (!script && !window.grecaptcha) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (window.grecaptcha) {
            initGrecaptcha();
          }
        };
        script.onerror = () => {
          if (isMounted) {
            setError('Failed to load Google reCAPTCHA. Please check your internet connection.');
          }
        };
        document.head.appendChild(script);
      } else {
        initGrecaptcha();
      }

      return () => {
        isMounted = false;
        if (intervalId) clearInterval(intervalId);
        if (widgetIdRef.current !== null && window.grecaptcha?.reset) {
          try {
            window.grecaptcha.reset(widgetIdRef.current);
          } catch {}
          widgetIdRef.current = null;
        }
      };
    }, [siteKey]);

    const handleRetry = () => {
      setError(null);
      setLoaded(false);
      widgetIdRef.current = null;
      if (window.grecaptcha?.ready) {
        window.grecaptcha.ready(() => {
          if (containerRef.current && window.grecaptcha?.render) {
            containerRef.current.innerHTML = '';
            try {
              widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
                sitekey: siteKey,
                callback: (token: string) => onVerifyRef.current(token),
                'expired-callback': () => onExpireRef.current && onExpireRef.current(),
                'error-callback': () => setError('Google reCAPTCHA verification error.'),
                theme: 'light'
              });
              setLoaded(true);
            } catch (e) {
              console.warn('Retry render error:', e);
            }
          }
        });
      }
    };

    return (
      <div className={`flex flex-col items-center justify-center my-3 select-none ${className}`}>
        {/* Placeholder skeleton while script / iframe is loading */}
        {!loaded && !error && (
          <div className="h-[78px] w-[304px] bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center gap-2.5 text-xs text-slate-500 animate-pulse shadow-sm">
            <span className="material-symbols-outlined text-[18px] animate-spin text-blue-600">
              progress_activity
            </span>
            <span>Loading Google reCAPTCHA...</span>
          </div>
        )}

        {/* DOM node where Google reCAPTCHA renders */}
        <div
          ref={containerRef}
          className={`w-[304px] min-h-[78px] flex items-center justify-center transition-all ${
            !loaded && !error ? 'hidden' : 'block'
          }`}
        />

        {/* Error notification if domain or network issue */}
        {error && (
          <div className="w-full max-w-[304px] p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex flex-col items-center gap-2 text-xs text-center animate-fade-in">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="material-symbols-outlined text-[16px] shrink-0 text-rose-600">error</span>
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-1 px-3 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold hover:bg-rose-700 transition-colors cursor-pointer border-0 outline-none"
            >
              Retry Loading reCAPTCHA
            </button>
          </div>
        )}
      </div>
    );
  }
);

GoogleRecaptcha.displayName = 'GoogleRecaptcha';
