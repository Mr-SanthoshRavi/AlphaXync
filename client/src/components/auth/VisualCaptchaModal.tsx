import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';

interface VisualCaptchaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (captchaToken: string) => void;
}

interface ChallengeData {
  challengeId: string;
  targetCategory: string;
  targetLabel: string;
  prompt: string;
  targetIconSvg: string;
  tiles: Array<{ id: number; category: string; svg: string }>;
  challengeToken: string;
}

export const VisualCaptchaModal: React.FC<VisualCaptchaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const loadChallenge = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSelectedIndices([]);
      setIsSuccess(false);
      const res = await api.getCaptchaChallenge();
      setChallenge(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load security challenge. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadChallenge();
    }
  }, [isOpen, loadChallenge]);

  const toggleSelect = (id: number) => {
    if (verifying || isSuccess) return;
    setError(null);
    setSelectedIndices((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleVerify = async () => {
    if (!challenge) return;
    if (selectedIndices.length === 0) {
      // Treat as Skip
      loadChallenge();
      return;
    }

    try {
      setVerifying(true);
      setError(null);
      const res = await api.verifyCaptcha(challenge.challengeToken, selectedIndices);
      if (res?.verified && res?.captchaToken) {
        setIsSuccess(true);
        setTimeout(() => {
          onSuccess(res.captchaToken);
          onClose();
        }, 700);
      } else {
        triggerShake('Incorrect selection. Please try again.');
        loadChallenge();
      }
    } catch (err: any) {
      triggerShake(err?.message || 'Verification failed. Please try again.');
      loadChallenge();
    } finally {
      setVerifying(false);
    }
  };

  const triggerShake = (msg: string) => {
    setError(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in select-none">
      <div
        className={`w-full max-w-[390px] bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-2xl overflow-hidden flex flex-col transition-all ${
          isShaking ? 'animate-shake' : ''
        }`}
      >
        {/* Header Banner (reCAPTCHA v2 style with futuristic AlphaXync styling) */}
        <div className="bg-gradient-to-r from-primary to-primary-container p-4 text-on-primary relative overflow-hidden">
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium text-on-primary/80 uppercase tracking-wider">
                Select all squares with
              </p>
              <h2 className="text-xl font-bold tracking-tight text-on-primary capitalize mt-0.5">
                {challenge?.targetLabel || 'Traffic Lights'}
              </h2>
              <p className="text-[11px] text-on-primary/75 mt-1">
                Click verify once all matching squares are selected.
              </p>
            </div>
            {/* Target Item Mini Preview Badge */}
            {challenge?.targetIconSvg && (
              <div
                className="w-13 h-13 rounded-xl bg-white/15 p-1 border border-white/20 shadow-inner shrink-0 flex items-center justify-center overflow-hidden"
                dangerouslySetInnerHTML={{ __html: challenge.targetIconSvg }}
                title={`Target: ${challenge.targetLabel}`}
              />
            )}
          </div>
        </div>

        {/* Challenge Area */}
        <div className="p-3 bg-surface-container-low/40">
          {loading ? (
            <div className="w-full aspect-square flex flex-col items-center justify-center gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin">
                progress_activity
              </span>
              <p className="text-xs font-medium">Generating visual challenge...</p>
            </div>
          ) : isSuccess ? (
            <div className="w-full aspect-square flex flex-col items-center justify-center gap-2 bg-primary/5 rounded-xl border border-primary/20 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-primary shadow-lg shadow-primary/25">
                <span className="material-symbols-outlined text-3xl font-bold">check</span>
              </div>
              <p className="text-base font-bold text-on-surface mt-2">Verification Passed</p>
              <p className="text-xs text-on-surface-variant">AlphaXync Security Shield</p>
            </div>
          ) : !challenge ? (
            <div className="w-full aspect-square flex flex-col items-center justify-center gap-3 text-center p-4">
              <span className="material-symbols-outlined text-4xl text-error">
                error_outline
              </span>
              <p className="text-sm font-semibold text-on-surface">Challenge Failed to Load</p>
              <p className="text-xs text-on-surface-variant max-w-[240px]">{error || 'Server error occurred'}</p>
              <button
                type="button"
                onClick={loadChallenge}
                className="mt-2 px-4 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              >
                Retry Challenge
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 w-full aspect-square">
              {challenge.tiles.map((tile) => {
                const isSelected = selectedIndices.includes(tile.id);
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => toggleSelect(tile.id)}
                    className={`relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 aspect-square group border-2 ${
                      isSelected
                        ? 'border-primary ring-3 ring-primary/30 scale-[0.95] shadow-md'
                        : 'border-outline-variant/30 hover:border-primary/40 hover:scale-[1.01]'
                    }`}
                  >
                    {/* SVG Visual */}
                    <div
                      className="w-full h-full pointer-events-none"
                      dangerouslySetInnerHTML={{ __html: tile.svg }}
                    />

                    {/* Selection Pill Badge */}
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md animate-scale-in">
                        <span className="material-symbols-outlined text-[16px] font-bold">check</span>
                      </div>
                    )}

                    {/* Subtle Overlay on Hover */}
                    <div
                      className={`absolute inset-0 transition-opacity ${
                        isSelected
                          ? 'bg-primary/10'
                          : 'bg-black/0 group-hover:bg-black/5'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-error-container/20 border border-error/40 text-error text-xs flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">info</span>
              <span className="flex-1 font-medium">{error}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-surface-container-lowest border-t border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-outline">
            <button
              type="button"
              onClick={loadChallenge}
              disabled={loading || verifying || isSuccess}
              className="p-1.5 rounded-lg hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer disabled:opacity-40"
              title="Reload new visual challenge"
            >
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-outline-variant select-none">
              <span className="material-symbols-outlined text-[16px]">security</span>
              <span>Shield v2.4</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={verifying || isSuccess}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleVerify}
              disabled={loading || verifying || isSuccess}
              className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-on-primary text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
            >
              {verifying ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    progress_activity
                  </span>
                  <span>Verifying...</span>
                </>
              ) : selectedIndices.length === 0 ? (
                <span>Skip</span>
              ) : (
                <span>Verify ({selectedIndices.length})</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
