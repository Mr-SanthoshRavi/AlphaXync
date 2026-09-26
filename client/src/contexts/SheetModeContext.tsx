import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export type SheetMode = 'native' | 'google';

interface SheetModeContextType {
  mode: SheetMode;
  isLocked: boolean;
  sheetName: string;
  googleConnected: boolean;
  googleSheetTitle: string;
  counts: { native: number; google: number };
  switchMode: (newMode: SheetMode, force?: boolean) => boolean;
  toggleLock: () => void;
  updateSheetName: (name: string) => void;
  refreshCounts: () => Promise<void>;
}

const SheetModeContext = createContext<SheetModeContextType | undefined>(undefined);

export const SheetModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Read initial active mode from localStorage (default: 'native')
  const [mode, setMode] = useState<SheetMode>(() => {
    try {
      const saved = localStorage.getItem('alphasheet_active_mode');
      if (saved === 'google' || saved === 'native') return saved;
    } catch {}
    return 'native';
  });

  // Mode safety lock (default: true for strict protection)
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('alphasheet_mode_locked');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true; // Locked by default for safety
  });

  // Custom sheet title for Native AlphaSheet
  const [sheetName, setSheetName] = useState<string>(() => {
    try {
      return localStorage.getItem('alphasheet_custom_name') || 'Student Roster 2026';
    } catch {
      return 'Student Roster 2026';
    }
  });

  const [googleConnected, setGoogleConnected] = useState<boolean>(false);
  const [googleSheetTitle, setGoogleSheetTitle] = useState<string>('Google Sheets');
  const [counts, setCounts] = useState<{ native: number; google: number }>({ native: 0, google: 0 });

  // Fetch counts and Google status
  const refreshCounts = useCallback(async () => {
    try {
      const [allRes, syncRes] = await Promise.allSettled([
        api.getStudents({ limit: 1 }),
        api.getSyncStatus()
      ]);

      if (allRes.status === 'fulfilled' && (allRes.value as any)?.counts) {
        setCounts({
          native: (allRes.value as any).counts.native || 0,
          google: (allRes.value as any).counts.google || 0
        });
      }

      if (syncRes.status === 'fulfilled' && syncRes.value) {
        const val = syncRes.value as any;
        setGoogleConnected(!!val.connected || val.status === 'CONNECTED');
        if (val.spreadsheetTitle || val.sheetTitle) {
          setGoogleSheetTitle(val.spreadsheetTitle || val.sheetTitle);
        }
      }
    } catch (e) {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    refreshCounts();

    // Listen to external mode change events (e.g. from studio or drawer)
    const handleModeEvent = (e: any) => {
      if (e.detail?.mode && (e.detail.mode === 'native' || e.detail.mode === 'google')) {
        setMode(e.detail.mode);
      }
      if (e.detail?.sheetName) {
        setSheetName(e.detail.sheetName);
      }
      if (e.detail?.counts) {
        setCounts(e.detail.counts);
      }
    };

    window.addEventListener('alphasheet:mode-changed', handleModeEvent);
    return () => window.removeEventListener('alphasheet:mode-changed', handleModeEvent);
  }, [refreshCounts]);

  const switchMode = (newMode: SheetMode, force: boolean = false): boolean => {
    if (newMode === mode) return true;

    // Strict mode lock: cannot switch if locked unless force is explicitly confirmed
    if (isLocked && !force) {
      return false;
    }

    setMode(newMode);
    try {
      localStorage.setItem('alphasheet_active_mode', newMode);
    } catch {}

    window.dispatchEvent(
      new CustomEvent('alphasheet:mode-changed', {
        detail: { mode: newMode, sheetName, counts }
      })
    );
    return true;
  };

  const toggleLock = () => {
    setIsLocked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('alphasheet_mode_locked', String(next));
      } catch {}
      return next;
    });
  };

  const updateSheetName = (name: string) => {
    const trimmed = name.trim() || 'Student Roster 2026';
    setSheetName(trimmed);
    try {
      localStorage.setItem('alphasheet_custom_name', trimmed);
    } catch {}
    window.dispatchEvent(
      new CustomEvent('alphasheet:mode-changed', {
        detail: { mode, sheetName: trimmed, counts }
      })
    );
  };

  return (
    <SheetModeContext.Provider
      value={{
        mode,
        isLocked,
        sheetName,
        googleConnected,
        googleSheetTitle,
        counts,
        switchMode,
        toggleLock,
        updateSheetName,
        refreshCounts
      }}
    >
      {children}
    </SheetModeContext.Provider>
  );
};

export const useSheetMode = (): SheetModeContextType => {
  const context = useContext(SheetModeContext);
  if (!context) {
    throw new Error('useSheetMode must be used within a SheetModeProvider');
  }
  return context;
};
