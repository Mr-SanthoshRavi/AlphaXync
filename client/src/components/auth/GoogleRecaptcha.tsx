import React, { useEffect, useRef, useState } from 'react';

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

export const GoogleRecaptcha: React.FC<GoogleRecaptchaProps> = ({
  onVerify,
  onExpire,
  siteKey = (import.meta as any).env?.VITE_RECAPTCHA_SITE_KEY || '6LdaGswtAAAAADrMcAW3-eMPm1zirbF2EbluTQor',
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    function renderWidget() {
      if (!isMounted || !containerRef.current || !window.grecaptcha || widgetIdRef.current !== null) {
        return;
      }
      try {
        // Create an isolated sub-element so React never touches Google reCAPTCHA iframes
        const targetDiv = document.createElement('div');
        containerRef.current.appendChild(targetDiv);

        widgetIdRef.current = window.grecaptcha.render(targetDiv, {
          sitekey: siteKey,
          callback: (token: string) => {
            if (isMounted) onVerify(token);
          },
          'expired-callback': () => {
            if (isMounted && onExpire) onExpire();
          },
          'error-callback': () => {
            if (isMounted) setError('Google reCAPTCHA failed to load. Please verify your domain.');
          },
          theme: 'light'
        });
        setLoaded(true);
      } catch (err: any) {
        console.warn('Google reCAPTCHA render warning:', err);
      }
    }

    // Check if script is already present
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
    };
  }, [siteKey, onVerify, onExpire]);

  return (
    <div className={`flex flex-col items-center justify-center my-3 select-none ${className}`}>
      <div
        ref={containerRef}
        className="min-h-[78px] flex items-center justify-center transition-all rounded-lg overflow-hidden"
      >
        {!loaded && !error && (
          <div className="h-[78px] w-[304px] bg-surface-container-low/60 rounded-lg border border-outline-variant/30 flex items-center justify-center gap-2.5 text-xs text-on-surface-variant animate-pulse">
            <span className="material-symbols-outlined text-[18px] animate-spin text-primary">
              progress_activity
            </span>
            <span>Loading Google reCAPTCHA...</span>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-error mt-1 text-center font-medium">
          {error}
        </p>
      )}
    </div>
  );
};
