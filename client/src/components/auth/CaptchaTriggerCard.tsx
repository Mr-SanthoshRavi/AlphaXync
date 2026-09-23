import React from 'react';

interface CaptchaTriggerCardProps {
  isVerified: boolean;
  onTrigger: () => void;
  disabled?: boolean;
}

export const CaptchaTriggerCard: React.FC<CaptchaTriggerCardProps> = ({
  isVerified,
  onTrigger,
  disabled = false,
}) => {
  return (
    <div
      onClick={!isVerified && !disabled ? onTrigger : undefined}
      className={`w-full p-3.5 rounded-xl border transition-all select-none ${
        isVerified
          ? 'bg-emerald-500/10 border-emerald-500/35 text-on-surface shadow-sm cursor-default'
          : 'bg-surface-container-low hover:bg-surface-container border-outline-variant/40 hover:border-primary/50 cursor-pointer shadow-sm active:scale-[0.99]'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left Side: Checkbox / Status Indicator */}
        <div className="flex items-center gap-3">
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
              isVerified
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                : 'border-2 border-outline hover:border-primary bg-surface-container-lowest'
            }`}
          >
            {isVerified ? (
              <span className="material-symbols-outlined text-[18px] font-bold">check</span>
            ) : null}
          </div>

          <div className="flex flex-col text-left">
            <span
              className={`text-xs font-semibold ${
                isVerified ? 'text-emerald-700 dark:text-emerald-400' : 'text-on-surface'
              }`}
            >
              {isVerified ? 'Security Verification Passed' : "I'm not a robot (Visual Challenge)"}
            </span>
            <span className="text-[10px] text-on-surface-variant font-medium">
              {isVerified
                ? 'Protected by AlphaXync Cryptographic Shield'
                : 'Click to complete 3x3 image verification'}
            </span>
          </div>
        </div>

        {/* Right Side: Shield Branding Badge */}
        <div className="flex flex-col items-center shrink-0 pr-1">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isVerified
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-primary/10 text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isVerified ? 'verified_user' : 'security'}
            </span>
          </div>
          <span className="text-[9px] font-bold text-outline-variant mt-0.5 uppercase tracking-tighter">
            Shield v2.4
          </span>
        </div>
      </div>
    </div>
  );
};
