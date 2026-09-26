import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSheetMode } from '../../contexts/SheetModeContext';

interface HeaderProps {
  currentTitle: string;
  cashierMode: boolean;
  onToggleCashierMode: () => void;
  lastSyncedText?: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  mockMode?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTitle,
  cashierMode,
  onToggleCashierMode,
  lastSyncedText,
  searchQuery,
  onSearchChange,
  mockMode = false,
  sidebarCollapsed = false,
  onToggleSidebar,
}) => {
  const { user, logout } = useAuth();
  const {
    mode,
    isLocked,
    sheetName,
    googleSheetTitle,
    counts,
    switchMode,
    toggleLock,
    updateSheetName
  } = useSheetMode();

  const [showModeModal, setShowModeModal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(sheetName);
  const [confirmSwitch, setConfirmSwitch] = useState<'native' | 'google' | null>(null);

  const handleSaveTitle = () => {
    updateSheetName(tempTitle);
    setEditingTitle(false);
  };

  const handleExecuteSwitch = (target: 'native' | 'google') => {
    switchMode(target, true);
    setConfirmSwitch(null);
    setShowModeModal(false);
  };

  return (
    <>
      <header
        className={`fixed top-0 right-0 h-14 bg-surface/90 backdrop-blur-md border-b border-outline-variant/25 z-40 px-space-xl flex items-center justify-between select-none transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'left-[72px]' : 'left-64'
        }`}
      >
        {/* Left Breadcrumbs & Mode Badge */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              title={sidebarCollapsed ? 'Expand Sidebar (Maximize)' : 'Collapse Sidebar (Minimize)'}
              className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">
                {sidebarCollapsed ? 'menu_open' : 'menu'}
              </span>
            </button>
          )}

          <div className="flex items-center gap-1 font-label-md text-label-md min-w-0 shrink">
            <span className="text-on-surface-variant font-medium hidden lg:inline">Institution</span>
            <span className="material-symbols-outlined text-outline text-[14px] hidden lg:inline">chevron_right</span>
            <span className="text-on-surface font-bold truncate max-w-[110px] sm:max-w-[180px] md:max-w-none">{currentTitle}</span>
          </div>

          {/* Strict Sheet Mode Safety Indicator Badge - ALWAYS VISIBLE */}
          <div className="h-4 w-[1px] bg-outline-variant/40 mx-0.5 shrink-0"></div>
          <button
            type="button"
            onClick={() => setShowModeModal(true)}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-200 shadow-xs hover:shadow-sm cursor-pointer shrink-0 ${
              mode === 'native'
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25 ring-1 ring-emerald-500/20'
                : 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-500/40 hover:bg-blue-500/25 ring-1 ring-blue-500/20'
            }`}
            title="Active Sheet Mode (Strict Single-Mode Safety Active) - Click to manage lock & mode"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                mode === 'native' ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500 animate-pulse'
              }`}
            />
            <span className="material-symbols-outlined text-[15px]">
              {mode === 'native' ? 'table_chart' : 'cloud_sync'}
            </span>
            <span className="font-bold whitespace-nowrap">
              {mode === 'native' ? 'Native Sheet' : 'Google Sheet'}
            </span>
            <span className="opacity-40 hidden md:inline">|</span>
            <span className="text-[11px] font-normal truncate max-w-[110px] hidden md:inline">
              {mode === 'native' ? sheetName : googleSheetTitle || 'Live Mirror'}
            </span>
            {isLocked ? (
              <span className="flex items-center gap-0.5 text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/30">
                <span className="material-symbols-outlined text-[10px]">lock</span>
                LOCKED
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/30">
                <span className="material-symbols-outlined text-[10px]">lock_open</span>
                UNLOCKED
              </span>
            )}
          </button>

          {lastSyncedText && (
            <div className="hidden xl:flex items-center gap-1.5 px-space-sm py-0.5 rounded-full bg-surface-container border border-outline-variant/30 text-on-surface-variant font-label-sm text-label-sm shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0"></span>
              <span>{lastSyncedText}</span>
            </div>
          )}
          {mockMode && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-400 font-data-mono text-[11px] font-bold tracking-wide animate-pulse shrink-0">
              <span className="material-symbols-outlined text-[14px]">warning</span>
              <span>MOCK</span>
            </div>
          )}
        </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-space-md shrink-0">
        {/* Global Search Bar */}
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-2.5 text-outline text-[16px]">search</span>
          <input
            className="w-28 sm:w-44 md:w-56 lg:w-64 focus:w-72 h-8 pl-8 pr-10 rounded bg-surface-container-lowest border border-outline-variant/40 text-on-surface font-body-sm text-body-sm placeholder:text-outline focus:outline-none focus:border-primary hover:bg-surface-container-low transition-all"
            placeholder="Search (Ctrl+K)..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            type="text"
          />
          <kbd className="hidden sm:inline absolute right-2 px-1.5 py-0.5 rounded bg-surface-container text-[10px] font-data-mono text-on-surface-variant border border-outline-variant/40 pointer-events-none">
            Ctrl K
          </kbd>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-space-xs">
          {/* Cashier Mode Toggle */}
          <button
            onClick={onToggleCashierMode}
            className={`h-8 px-space-sm rounded border flex items-center gap-1.5 transition-colors font-label-sm text-label-sm ${
              cashierMode
                ? 'bg-secondary text-on-secondary border-secondary'
                : 'bg-surface-container-low hover:bg-surface-container border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
            }`}
            type="button"
            title="Toggle between Cashier desk and Full Administration mode"
          >
            <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
            <span>{cashierMode ? 'Cashier Active' : 'Cashier Mode'}</span>
          </button>

          {/* Notifications */}
          <button
            className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors relative"
            type="button"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-error ring-1 ring-surface"></span>
          </button>

          {/* Help */}
          <button
            className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
            type="button"
            title="Operational Help"
          >
            <span className="material-symbols-outlined text-[20px]">help</span>
          </button>
        </div>

        {/* User Profile & Sign Out */}
        <div className="flex items-center gap-space-sm pl-1">
          <div className="flex flex-col text-right hidden sm:flex">
            <span className="text-xs font-semibold text-on-surface truncate max-w-[120px]">
              {user?.name || 'Admin User'}
            </span>
            <span className="text-[10px] font-data-mono text-on-surface-variant uppercase">
              {user?.role || 'ADMIN'}
            </span>
          </div>
          <div
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary text-xs font-bold shadow-sm"
            title={`${user?.name || 'User'} (${user?.email || ''})`}
          >
            {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
          </div>
          <button
            onClick={() => logout()}
            className="w-8 h-8 rounded flex items-center justify-center text-outline hover:text-error hover:bg-error-container/20 transition-colors"
            title="Sign out of AlphaXync"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>
      </div>
    </header>

    {/* Strict Mode Safety & Engine Management Modal */}
    {showModeModal && (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full shadow-2xl border border-outline-variant/30 overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/60">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  mode === 'native'
                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                    : 'bg-blue-500/15 text-blue-800 dark:text-blue-300'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {isLocked ? 'lock' : mode === 'native' ? 'table_chart' : 'cloud_sync'}
                </span>
              </div>
              <div>
                <h3 className="font-bold text-sm text-on-surface flex items-center gap-2">
                  <span>Sheet Engine Safety Lock</span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      isLocked
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {isLocked ? '🔒 Mode Locked' : '🔓 Mode Unlocked'}
                  </span>
                </h3>
                <p className="text-xs text-on-surface-variant">
                  Strict isolation active: Only ONE sheet engine operates at a time to prevent data collision.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowModeModal(false);
                setConfirmSwitch(null);
              }}
              className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-outline hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 space-y-4 text-xs">
            {/* Current Active Engine Card */}
            <div
              className={`p-4 rounded-xl border ${
                mode === 'native'
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30'
                  : 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">
                    {mode === 'native' ? 'verified' : 'sync'}
                  </span>
                  <span className="font-bold text-xs uppercase tracking-wide">
                    Active Sheet Mode: {mode === 'native' ? 'Native AlphaSheet' : 'Google Sheets'}
                  </span>
                </div>
                <span className="font-data-mono font-bold text-xs px-2 py-0.5 rounded bg-surface-container-highest">
                  {mode === 'native' ? `${counts.native} Records` : `${counts.google} Synced`}
                </span>
              </div>

              {mode === 'native' ? (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant font-medium">Sheet Name:</span>
                    {editingTitle ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          className="px-2 py-1 bg-surface rounded border border-outline-variant/40 text-xs font-semibold"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleSaveTitle}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>{sheetName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setTempTitle(sheetName);
                            setEditingTitle(true);
                          }}
                          className="text-outline hover:text-on-surface"
                          title="Rename Sheet"
                        >
                          <span className="material-symbols-outlined text-[15px]">edit</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-on-surface-variant">
                    ✓ Instant high-speed ledger. Native formula calculations, auto-saving, batch actions, and full offline freedom.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant font-medium">Spreadsheet Title:</span>
                    <span className="font-bold truncate max-w-[200px]">{googleSheetTitle}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant font-medium">Payment Data Edit:</span>
                    <span className="font-mono text-emerald-800 dark:text-emerald-300 font-semibold">🔒 Protected (Google Sheet Only)</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">
                    ✓ Google Sheets acts as single source of truth. Payments & financial amounts are strictly managed directly in your Google Spreadsheet to avoid sync drift.
                  </p>
                </div>
              )}
            </div>

            {/* Safety Lock Control */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low border border-outline-variant/25">
              <div className="flex items-center gap-2.5">
                <span className={`material-symbols-outlined text-[20px] ${isLocked ? 'text-amber-500' : 'text-outline'}`}>
                  {isLocked ? 'lock' : 'lock_open'}
                </span>
                <div>
                  <div className="font-semibold text-xs text-on-surface">Strict Mode Safety Lock</div>
                  <div className="text-[11px] text-on-surface-variant">
                    {isLocked
                      ? 'System is locked to prevent accidental sheet switching or data conflicts.'
                      : 'Mode is unlocked. You can safely switch the active sheet engine below.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleLock}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs ${
                  isLocked
                    ? 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/30'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">{isLocked ? 'lock_open' : 'lock'}</span>
                <span>{isLocked ? 'Unlock Mode' : 'Lock Mode'}</span>
              </button>
            </div>

            {/* Engine Switcher Section */}
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Switch Active Sheet Engine:
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Native AlphaSheet Option */}
                <button
                  type="button"
                  disabled={mode === 'native'}
                  onClick={() => {
                    if (isLocked) {
                      alert('Safety Lock is active! Please unlock the mode above to switch sheet engines.');
                      return;
                    }
                    setConfirmSwitch('native');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    mode === 'native'
                      ? 'border-emerald-500 bg-emerald-500/10 opacity-100 ring-2 ring-emerald-500/20'
                      : isLocked
                      ? 'border-outline-variant/30 bg-surface-container-low opacity-60 cursor-not-allowed'
                      : 'border-outline-variant/30 bg-surface-container-lowest hover:border-emerald-500/50 hover:bg-emerald-500/5 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-on-surface">
                      <span className="material-symbols-outlined text-[16px] text-emerald-800 dark:text-emerald-300">table_chart</span>
                      <span>Native AlphaSheet</span>
                    </span>
                    {mode === 'native' && (
                      <span className="material-symbols-outlined text-[16px] text-emerald-800 dark:text-emerald-300">check_circle</span>
                    )}
                  </div>
                  <div className="text-[11px] text-on-surface-variant">
                    Standalone local roster. Editable in AlphaSheet Studio.
                  </div>
                </button>

                {/* Google Sheets Option */}
                <button
                  type="button"
                  disabled={mode === 'google'}
                  onClick={() => {
                    if (isLocked) {
                      alert('Safety Lock is active! Please unlock the mode above to switch sheet engines.');
                      return;
                    }
                    setConfirmSwitch('google');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    mode === 'google'
                      ? 'border-blue-500 bg-blue-500/10 opacity-100 ring-2 ring-blue-500/20'
                      : isLocked
                      ? 'border-outline-variant/30 bg-surface-container-low opacity-60 cursor-not-allowed'
                      : 'border-outline-variant/30 bg-surface-container-lowest hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-on-surface">
                      <span className="material-symbols-outlined text-[16px] text-blue-800 dark:text-blue-300">cloud_sync</span>
                      <span>Google Sheets</span>
                    </span>
                    {mode === 'google' && (
                      <span className="material-symbols-outlined text-[16px] text-blue-800 dark:text-blue-300">check_circle</span>
                    )}
                  </div>
                  <div className="text-[11px] text-on-surface-variant">
                    Mirrored from Google Spreadsheet. Read-protected payment ledger.
                  </div>
                </button>
              </div>
            </div>

            {/* Confirmation Alert when user initiates switch */}
            {confirmSwitch && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-2 animate-fade-in">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <span className="material-symbols-outlined text-[18px] text-amber-500">warning</span>
                  <span>Confirm Engine Switch to {confirmSwitch === 'native' ? 'Native AlphaSheet' : 'Google Sheets'}</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  AlphaXync will switch the active ledger and automations to <strong>{confirmSwitch === 'native' ? 'Native AlphaSheet' : 'Google Sheets'}</strong>. Your data remains strictly separate with zero overwrites.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirmSwitch(null)}
                    className="px-3 py-1 rounded bg-surface-container text-xs font-semibold hover:bg-surface-container-high text-on-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExecuteSwitch(confirmSwitch)}
                    className="px-3.5 py-1 rounded bg-primary text-on-primary text-xs font-bold hover:bg-primary/90"
                  >
                    Yes, Switch Engine
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-3 border-t border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between text-xs">
            <span className="text-[11px] text-on-surface-variant">
              AlphaXync Architecture · Single-Engine Isolation
            </span>
            <button
              type="button"
              onClick={() => {
                setShowModeModal(false);
                setConfirmSwitch(null);
              }}
              className="px-4 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
};
