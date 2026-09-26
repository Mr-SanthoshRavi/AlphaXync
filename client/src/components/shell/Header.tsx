import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

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

  return (
    <header
      className={`fixed top-0 right-0 h-14 bg-surface/90 backdrop-blur-md border-b border-outline-variant/25 z-40 px-space-xl flex items-center justify-between select-none transition-all duration-300 ease-in-out ${
        sidebarCollapsed ? 'left-[72px]' : 'left-64'
      }`}
    >
      {/* Left Breadcrumbs */}
      <div className="flex items-center gap-space-md">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? 'Expand Sidebar (Maximize)' : 'Collapse Sidebar (Minimize)'}
            className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">
              {sidebarCollapsed ? 'menu_open' : 'menu'}
            </span>
          </button>
        )}

        <div className="flex items-center gap-1.5 font-label-md text-label-md">
          <span className="text-on-surface-variant font-medium">Institution</span>
          <span className="material-symbols-outlined text-outline text-[14px]">chevron_right</span>
          <span className="text-on-surface font-bold">{currentTitle}</span>
        </div>
        {lastSyncedText && (
          <>
            <div className="h-4 w-[1px] bg-outline-variant/40 mx-space-xs"></div>
            <div className="flex items-center gap-1.5 px-space-sm py-0.5 rounded-full bg-surface-container border border-outline-variant/30 text-on-surface-variant font-label-sm text-label-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0"></span>
              <span>{lastSyncedText}</span>
            </div>
          </>
        )}
        {mockMode && (
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-400 font-data-mono text-[11px] font-bold tracking-wide animate-pulse">
            <span className="material-symbols-outlined text-[14px]">warning</span>
            <span>MOCK MODE ACTIVE</span>
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-space-md">
        {/* Global Search Bar */}
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-2.5 text-outline text-[16px]">search</span>
          <input
            className="w-80 h-8 pl-8 pr-12 rounded bg-surface-container-lowest border border-outline-variant/40 text-on-surface font-body-sm text-body-sm placeholder:text-outline focus:outline-none focus:border-primary hover:bg-surface-container-low transition-colors"
            placeholder="Search records, enrollments, vouchers (Ctrl+K)..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            type="text"
          />
          <kbd className="absolute right-2 px-1.5 py-0.5 rounded bg-surface-container text-[10px] font-data-mono text-on-surface-variant border border-outline-variant/40 pointer-events-none">
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
  );
};
