import React, { useEffect, useRef, useState } from 'react';

interface GoogleRecaptchaProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  siteKey?: string;
  className?: string;
  onFallbackRequest?: () => void;
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

export const GoogleRecaptcha: React.FC<GoogleRecaptchaProps> = ({
  onVerify,
  onExpire,
  siteKey = (import.meta as any).env?.VITE_RECAPTCHA_SITE_KEY || '6LdaGswtAAAAADrMcAW3-eMPm1zirbF2EbluTQor',
  className = '',
  onFallbackRequest
}) => {
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    function renderWidget() {
      if (!isMounted || !widgetContainerRef.current || !window.grecaptcha || widgetIdRef.current !== null) {
        return;
      }
      try {
        // Clear any previous nodes inside unmanaged container
        widgetContainerRef.current.innerHTML = '';

        widgetIdRef.current = window.grecaptcha.render(widgetContainerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            if (isMounted) onVerify(token);
          },
          'expired-callback': () => {
            if (isMounted && onExpire) onExpire();
          },
          'error-callback': () => {
            if (isMounted) {
              setError('Google reCAPTCHA domain is not authorized for this domain.');
            }
          },
          theme: 'light'
        });
        if (isMounted) {
          setLoaded(true);
        }
      } catch (err: any) {
        console.warn('Google reCAPTCHA render warning:', err);
      }
    }

    if (typeof window.grecaptcha?.render === 'function') {
      window.grecaptcha.ready(renderWidget);
      return;
    }

    const scriptId = 'google-recaptcha-v2-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.grecaptcha) {
          window.grecaptcha.ready(renderWidget);
        }
      };
      script.onerror = () => {
        if (isMounted) setError('Failed to load Google reCAPTCHA script.');
      };
      document.body.appendChild(script);
    } else {
      const checkInterval = setInterval(() => {
        if (typeof window.grecaptcha?.render === 'function') {
          clearInterval(checkInterval);
          window.grecaptcha.ready(renderWidget);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    return () => {
      isMounted = false;
      if (widgetIdRef.current !== null && window.grecaptcha?.reset) {
        try {
          window.grecaptcha.reset(widgetIdRef.current);
        } catch {
          // ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, onVerify, onExpire]);

  return (
    <div className={`flex flex-col items-center justify-center my-3 select-none ${className}`}>
      {/* Sibling 1: React loading placeholder */}
      {!loaded && !error && (
        <div className="h-[78px] w-[304px] bg-surface-container-low/60 rounded-lg border border-outline-variant/30 flex items-center justify-center gap-2.5 text-xs text-on-surface-variant animate-pulse">
          <span className="material-symbols-outlined text-[18px] animate-spin text-primary">
            progress_activity
          </span>
          <span>Loading Google reCAPTCHA...</span>
        </div>
      )}

      {/* Sibling 2: Pure unmanaged DOM node exclusively for grecaptcha */}
      <div
        ref={widgetContainerRef}
        style={{ display: loaded && !error ? 'block' : 'none' }}
        className="min-h-[78px] transition-all rounded-lg overflow-hidden"
      />

      {/* Sibling 3: Error and fallback */}
      {error && (
        <div className="w-full max-w-[304px] p-3 rounded-xl bg-error-container/20 border border-error/30 text-error flex flex-col items-center gap-2 text-xs text-center animate-fade-in">
          <div className="flex items-center gap-1 font-medium">
            <span className="material-symbols-outlined text-[16px] shrink-0">domain_disabled</span>
            <span>{error}</span>
          </div>
          {onFallbackRequest && (
            <button
              type="button"
              onClick={onFallbackRequest}
              className="mt-0.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-[11px] font-semibold hover:opacity-90 transition-all cursor-pointer shadow-sm"
            >
              Use Built-in Visual Shield →
            </button>
          )}
        </div>
      )}
    </div>
  );
};
