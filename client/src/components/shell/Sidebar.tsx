import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';

export type NavTab = 'dashboard' | 'students' | 'fees' | 'automations' | 'messages' | 'sync' | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  cashierMode: boolean;
  institutionName?: string;
  institutionCode?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  cashierMode,
  institutionName = "St. Xavier's Eng. College",
  institutionCode = "STXAVIER",
  collapsed = false,
  onToggleCollapse,
}) => {
  const [sheetStatus, setSheetStatus] = useState<{ isConnected: boolean; providerLabel: string }>({
    isConnected: false,
    providerLabel: 'Spreadsheet'
  });

  const checkSyncStatus = async () => {
    try {
      const res = await api.getSyncStatus();
      const conns = res?.connections || [];
      const activeConn = conns.find((c: any) => c.status === 'CONNECTED');
      if (activeConn) {
        const label = activeConn.provider === 'microsoft_excel' ? 'MS Excel' : 'Google Sheets';
        setSheetStatus({ isConnected: true, providerLabel: label });
      } else {
        setSheetStatus({ isConnected: false, providerLabel: 'Spreadsheet' });
      }
    } catch {
      setSheetStatus({ isConnected: false, providerLabel: 'Spreadsheet' });
    }
  };

  useEffect(() => {
    checkSyncStatus();
    const handleUpdate = () => checkSyncStatus();
    window.addEventListener('campusflow:data-updated', handleUpdate);
    return () => window.removeEventListener('campusflow:data-updated', handleUpdate);
  }, []);
  const navItems: { id: NavTab; label: string; icon: string; adminOnly?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'students', label: 'Students', icon: 'school' },
    { id: 'fees', label: 'Fees & Payments', icon: 'receipt_long' },
    { id: 'automations', label: 'Automations', icon: 'smart_toy', adminOnly: true },
    { id: 'messages', label: 'Messages', icon: 'chat' },
    { id: 'sync', label: 'Sync & Data', icon: 'cloud_sync', adminOnly: true },
    { id: 'settings', label: 'Settings', icon: 'tune', adminOnly: true },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 h-full ${
        collapsed ? 'w-[72px]' : 'w-64'
      } bg-surface-container-lowest border-r border-outline-variant/30 z-50 flex flex-col justify-between select-none shadow-[0_1px_8px_rgba(0,0,0,0.02)] transition-all duration-300 ease-in-out`}
    >
      <div className="flex flex-col">
        {/* Brand Header */}
        <div
          className={`h-14 ${
            collapsed ? 'px-3 justify-center' : 'px-space-md justify-between'
          } flex items-center border-b border-outline-variant/20 transition-all`}
        >
          <div className="flex items-center gap-space-sm min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-on-primary font-headline-sm text-headline-sm font-bold shadow-xs shrink-0 tracking-tight">
              A
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0 animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <span className="font-headline-sm text-headline-sm text-on-surface truncate leading-tight font-bold tracking-tight">
                    AlphaXync
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-primary font-data-mono text-[9px] font-bold uppercase tracking-wider">
                    BETA
                  </span>
                </div>
                <span className="font-label-sm text-[11px] text-on-surface-variant truncate">
                  Institutional Operations (Beta v2.4)
                </span>
              </div>
            )}
          </div>

          {onToggleCollapse && !collapsed && (
            <button
              onClick={onToggleCollapse}
              title="Collapse Sidebar (Minimize)"
              className="p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">left_panel_close</span>
            </button>
          )}
        </div>

        {/* Institution Info Badge */}
        {!collapsed ? (
          <div className="px-space-md py-space-sm animate-fade-in">
            <div className="p-space-xs rounded-lg bg-surface-container-low border border-outline-variant/25 flex items-center justify-between">
              <div className="flex items-center gap-space-xs min-w-0">
                <span className="material-symbols-outlined text-outline text-[16px] shrink-0">domain</span>
                <span className="font-label-sm text-label-sm text-on-surface truncate font-medium">{institutionName}</span>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-surface-container font-data-mono text-[10px] text-on-surface-variant uppercase tracking-wider shrink-0 font-bold">
                {institutionCode}
              </span>
            </div>
          </div>
        ) : (
          <div className="px-2 py-2 flex justify-center" title={`${institutionName} (${institutionCode})`}>
            <div className="w-8 h-8 rounded-lg bg-surface-container-low border border-outline-variant/25 flex items-center justify-center text-outline">
              <span className="material-symbols-outlined text-[16px]">domain</span>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className={`flex flex-col gap-1 ${collapsed ? 'px-2' : 'px-space-sm'} mt-1`}>
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            const isRestricted = cashierMode && item.adminOnly;

            return (
              <button
                key={item.id}
                onClick={() => !isRestricted && onSelectTab(item.id)}
                disabled={isRestricted}
                title={collapsed ? item.label : undefined}
                className={`group relative flex items-center ${
                  collapsed ? 'justify-center h-10 w-full px-0' : 'justify-between px-3 py-2'
                } rounded-lg transition-all text-left font-body-md text-body-md ${
                  isActive
                    ? 'bg-primary text-on-primary font-semibold shadow-xs'
                    : isRestricted
                    ? 'text-outline/40 cursor-not-allowed'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} min-w-0`}>
                  <span
                    className={`material-symbols-outlined text-[20px] ${
                      isActive ? 'text-on-primary' : 'text-on-surface-variant group-hover:text-on-surface'
                    }`}
                  >
                    {item.icon}
                  </span>
                  {!collapsed && <span className="truncate text-sm">{item.label}</span>}
                </div>

                {!collapsed && isRestricted && (
                  <span className="text-[10px] font-data-mono bg-surface-container-high px-1.5 py-0.5 rounded text-outline font-medium">
                    Admin
                  </span>
                )}

                {/* Sleek Tooltip when collapsed */}
                {collapsed && (
                  <div className="absolute left-full ml-3 px-2.5 py-1 bg-surface-container-highest text-on-surface text-xs font-semibold rounded-md shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap border border-outline-variant/30">
                    {item.label}
                    {isRestricted && <span className="ml-1 text-[10px] text-outline font-normal">(Admin)</span>}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer / Status & Station */}
      <div className={`flex flex-col border-t border-outline-variant/20 ${collapsed ? 'p-2' : 'p-space-sm gap-2'} bg-surface-container-lowest`}>
        {/* Source Connection Live / Offline Indicator */}
        {!collapsed ? (
          <div className="px-space-sm py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/20 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-space-xs min-w-0">
              <span
                className={`w-2 h-2 rounded-full ${
                  sheetStatus.isConnected
                    ? 'bg-secondary ring-2 ring-secondary/30'
                    : 'bg-outline/40'
                } shrink-0`}
              ></span>
              <span className="font-label-sm text-label-sm text-on-surface font-medium truncate">
                {sheetStatus.providerLabel}
              </span>
            </div>
            <span
              className={`font-data-mono text-[10px] ${
                sheetStatus.isConnected ? 'text-secondary font-bold' : 'text-on-surface-variant font-medium'
              } uppercase tracking-wider shrink-0`}
            >
              {sheetStatus.isConnected ? 'LIVE' : 'NOT LINKED'}
            </span>
          </div>
        ) : (
          <div
            className="flex justify-center py-1.5"
            title={`${sheetStatus.providerLabel}: ${sheetStatus.isConnected ? 'LIVE' : 'NOT LINKED'}`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                sheetStatus.isConnected ? 'bg-secondary ring-2 ring-secondary/30' : 'bg-outline/40'
              }`}
            ></span>
          </div>
        )}

        {/* User Station Box */}
        {!collapsed ? (
          <div className="flex items-center justify-between p-1.5 rounded-lg hover:bg-surface-container-low transition-colors animate-fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                {cashierMode ? 'FD' : 'AD'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-on-surface font-bold truncate">
                  {cashierMode ? 'Finance Desk #04' : 'Administration'}
                </span>
                <span className="text-[11px] text-on-surface-variant truncate">
                  {cashierMode ? 'Cashier Station' : 'Chief Operations Desk'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center" title={cashierMode ? 'Finance Desk #04 (Cashier)' : 'Administration (Chief Operations Desk)'}>
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
              {cashierMode ? 'FD' : 'AD'}
            </div>
          </div>
        )}

        {/* Bottom Expand Toggle when collapsed */}
        {collapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title="Expand Sidebar (Maximize)"
            className="w-full mt-1 py-1.5 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">left_panel_open</span>
          </button>
        )}
      </div>
    </aside>
  );
};
