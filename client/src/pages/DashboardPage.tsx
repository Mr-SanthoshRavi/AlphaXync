import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface DashboardPageProps {
  onNavigateTab: (tab: any) => void;
  cashierMode: boolean;
}

interface DashboardSummary {
  cards: {
    totalStudents: number;
    pendingFees: number;
    paidToday: number;
    messagesSentToday: number;
  };
  paymentOverview: {
    totalDue: number;
    totalCollected: number;
    totalPending: number;
    totalOverdue: number;
  };
  automationActivity: {
    greetings: number;
    feeReminders: number;
    announcements: number;
    staffMessages: number;
  };
  needsAttention: Array<{
    id: string;
    type: 'WARNING' | 'ERROR' | 'INFO';
    title: string;
    description: string;
    actionLabel: string;
    actionUrl: string;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    reason?: string;
    timestamp: string;
  }>;
  syncHealth: {
    status: string;
    lastSyncAt?: string;
    syncStatus: string;
  };
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigateTab }) => {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const summary = await api.getDashboardSummary();
      setData(summary);
    } catch (err: any) {
      console.error('Error loading dynamic dashboard data:', err);
      setError(err?.message || 'Failed to load dashboard data.');
      // Keep real empty fallback structure so UI never crashes or shows fake mock data
      setData({
        cards: { totalStudents: 0, pendingFees: 0, paidToday: 0, messagesSentToday: 0 },
        paymentOverview: { totalDue: 0, totalCollected: 0, totalPending: 0, totalOverdue: 0 },
        automationActivity: { greetings: 0, feeReminders: 0, announcements: 0, staffMessages: 0 },
        needsAttention: [],
        recentActivity: [],
        syncHealth: { status: 'DISCONNECTED', syncStatus: 'Offline or Unsynced' },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const onDataUpdated = () => {
      loadData();
    };

    window.addEventListener('campusflow:data-updated', onDataUpdated);

    return () => {
      window.removeEventListener('campusflow:data-updated', onDataUpdated);
    };
  }, []);

  const handlePullSync = async () => {
    setSyncing(true);
    setSyncToast('Triggering Google Sheet synchronization...');
    try {
      const res = await api.triggerSync();
      const metrics = res?.metrics || res;
      setSyncToast(
        `Sync completed! ${metrics.rowsUpdated ?? 0} updated, ${metrics.rowsAdded ?? 0} added.`
      );
      await loadData();
    } catch (err: any) {
      setSyncToast(`Sync error: ${err.message || 'Failed to sync'}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncToast(null), 4000);
    }
  };

  const cards = data?.cards || {
    totalStudents: 0,
    pendingFees: 0,
    paidToday: 0,
    messagesSentToday: 0,
  };

  const overview = data?.paymentOverview || {
    totalDue: 0,
    totalCollected: 0,
    totalPending: 0,
    totalOverdue: 0,
  };

  const auto = data?.automationActivity || {
    greetings: 0,
    feeReminders: 0,
    announcements: 0,
    staffMessages: 0,
  };

  const attentionItems = data?.needsAttention || [];

  const totalDue = overview.totalDue || 0;
  const collectedPct = totalDue > 0 ? Math.round((overview.totalCollected / totalDue) * 1000) / 10 : 0;
  const pendingPct = totalDue > 0 ? Math.round((overview.totalPending / totalDue) * 1000) / 10 : 0;
  const overduePct = totalDue > 0 ? Math.round((overview.totalOverdue / totalDue) * 1000) / 10 : 0;

  return (
    <div className="flex flex-col w-full pb-10">
      {/* Sync Toast */}
      {syncToast && (
        <div className="fixed top-16 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-2 rounded shadow-lg flex items-center gap-2 border border-outline-variant/30 text-body-sm animate-fade-in">
          <span className="material-symbols-outlined text-secondary-fixed text-[18px]">info</span>
          <span>{syncToast}</span>
        </div>
      )}

      {/* Operational Sub-Header & Live Controls */}
      <div className="flex items-center justify-between py-space-sm mb-space-md">
        <div className="flex items-baseline gap-space-md">
          <div className="flex items-center gap-space-xs">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                data?.syncHealth?.status === 'CONNECTED' ? 'bg-secondary animate-pulse' : 'bg-outline'
              }`}
            ></span>
            <span className="font-headline-md text-headline-md text-on-surface tracking-tight">
              Institutional Operations Console
            </span>
          </div>
          <span className="font-data-mono text-data-mono text-on-surface-variant">
            {data?.syncHealth?.lastSyncAt
              ? `Last Synced: ${new Date(data.syncHealth.lastSyncAt).toLocaleTimeString()}`
              : 'Live Operations Snapshot'}
          </span>
        </div>

        <div className="flex items-center gap-space-xs">
          <div className="flex items-center bg-surface-container-low p-0.5 rounded shadow-sm">
            <button
              onClick={() => loadData()}
              disabled={loading}
              className="px-space-sm py-1 rounded bg-surface-container-lowest text-on-surface font-label-sm text-label-sm shadow-sm transition-all flex items-center gap-1"
              title="Refresh console data"
            >
              <span className={`material-symbols-outlined text-[14px] ${loading ? 'animate-spin' : ''}`}>
                refresh
              </span>
              <span>Refresh</span>
            </button>
          </div>
          <button
            onClick={handlePullSync}
            disabled={syncing}
            className="h-8 px-space-md bg-primary hover:bg-primary-container text-on-primary rounded font-label-sm text-label-sm flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[16px] ${syncing ? 'animate-spin' : ''}`}>
              sync
            </span>
            <span>{syncing ? 'Syncing...' : 'Pull Sheet Sync'}</span>
          </button>
        </div>
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="mb-4 p-3 rounded bg-error-container/20 border border-error/40 text-error flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadData()}
            className="text-xs font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* 1. TOP TIER: 4 Operational Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter mb-space-lg">
        {/* Card 1: Total Students */}
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block">
                Total Enrolled Students
              </span>
              <span className="font-headline-lg text-headline-lg text-on-surface mt-1 block font-bold">
                {cards.totalStudents.toLocaleString()}
              </span>
            </div>
            <div className="w-8 h-8 rounded bg-surface-container-low flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[18px]">group</span>
            </div>
          </div>
          <div className="mt-space-md pt-space-xs flex items-center justify-between bg-surface-container-low px-space-xs py-1 rounded">
            <span className="font-label-sm text-label-sm text-secondary font-medium">
              Verified in Ledger
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {data?.syncHealth?.status === 'CONNECTED' ? 'Google Sheets Sync' : 'Direct DB'}
            </span>
          </div>
        </div>

        {/* Card 2: Pending Fees */}
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider block font-semibold">
                Pending Tuition Fees
              </span>
              <span className="font-data-mono text-headline-lg text-on-surface mt-1 block tracking-tight font-bold">
                ₹{cards.pendingFees.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="w-8 h-8 rounded bg-tertiary-fixed flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[18px]">pending_actions</span>
            </div>
          </div>
          <div className="mt-space-md pt-space-xs flex items-center justify-between bg-surface-container-low px-space-xs py-1 rounded">
            <span className="font-body-sm text-body-sm text-on-surface-variant">Pipeline balance:</span>
            <span className="font-data-mono text-data-mono text-tertiary font-semibold">
              ₹{(cards.pendingFees / 100000).toFixed(2)} Lakhs
            </span>
          </div>
        </div>

        {/* Card 3: Collected Today */}
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block">
                Collected Today
              </span>
              <span className="font-data-mono text-headline-lg text-secondary mt-1 block tracking-tight font-bold">
                ₹{cards.paidToday.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="w-8 h-8 rounded bg-secondary-fixed flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
            </div>
          </div>
          <div className="mt-space-md pt-space-xs flex items-center justify-between bg-surface-container-low px-space-xs py-1 rounded">
            <span className="font-body-sm text-body-sm text-on-surface-variant">Settled through:</span>
            <span className="font-data-mono text-data-mono text-on-surface font-semibold">
              Razorpay & Cashier
            </span>
          </div>
        </div>

        {/* Card 4: Messages Sent Today */}
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block">
                Messages Sent Today
              </span>
              <span className="font-headline-lg text-headline-lg text-on-surface mt-1 block font-bold">
                {cards.messagesSentToday.toLocaleString()}
              </span>
            </div>
            <div className="w-8 h-8 rounded bg-surface-container-low flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[18px]">chat_bubble_outline</span>
            </div>
          </div>
          <div className="mt-space-md pt-space-xs flex items-center gap-1.5 bg-surface-container-low px-space-xs py-1 rounded">
            <span className="w-2 h-2 rounded-full bg-secondary shrink-0"></span>
            <span className="font-label-sm text-label-sm text-on-surface">Meta Cloud API</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
              Idempotent Dispatch
            </span>
          </div>
        </div>
      </div>

      {/* 2. SECTION A: Payment Overview Breakdown Grid */}
      <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm mb-space-lg">
        <div className="flex items-center justify-between mb-space-md">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-[20px]">analytics</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              Institutional Fee Velocity & Distribution
            </h2>
          </div>
          <div className="flex items-center gap-space-md">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Gross Pipeline:</span>
            <span className="font-data-mono text-data-mono-lg text-on-surface font-semibold">
              ₹{(totalDue / 100000).toFixed(2)} Lakhs
            </span>
          </div>
        </div>

        {/* Multi-Segment Visual Progress Bar */}
        <div className="w-full bg-surface-container-high h-3 rounded overflow-hidden flex mb-space-md p-0.5">
          {totalDue === 0 ? (
            <div className="bg-surface-container-high h-full w-full rounded text-center text-[9px] text-outline">
              No fee data yet
            </div>
          ) : (
            <>
              <div
                className="bg-secondary h-full rounded-l transition-all"
                style={{ width: `${Math.max(collectedPct, 0)}%` }}
                title={`Collected: ${collectedPct}%`}
              ></div>
              <div
                className="bg-primary h-full transition-all"
                style={{ width: `${Math.max(pendingPct, 0)}%` }}
                title={`Pending: ${pendingPct}%`}
              ></div>
              <div
                className="bg-error h-full rounded-r transition-all"
                style={{ width: `${Math.max(overduePct, 0)}%` }}
                title={`Overdue: ${overduePct}%`}
              ></div>
            </>
          )}
        </div>

        {/* 4-Column Metric Breakdown Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
          <div className="bg-surface-container-low p-space-sm rounded">
            <div className="flex items-center justify-between mb-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Total Due Pipeline</span>
              <span className="font-data-mono text-[11px] text-on-surface-variant">100%</span>
            </div>
            <div className="font-data-mono text-headline-sm text-on-surface font-semibold">
              ₹{(totalDue / 100000).toFixed(2)} L
            </div>
            <span className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 block">
              Scheduled institutional revenue
            </span>
          </div>

          <div className="bg-surface-container-low p-space-sm rounded relative">
            <div className="w-1 absolute left-0 top-1 bottom-1 bg-secondary rounded-l"></div>
            <div className="flex items-center justify-between mb-1 pl-1">
              <span className="font-label-sm text-label-sm text-secondary font-semibold">Collected</span>
              <span className="font-data-mono text-[11px] bg-secondary-container text-on-secondary-container px-1 rounded">
                {collectedPct}%
              </span>
            </div>
            <div className="font-data-mono text-headline-sm text-secondary pl-1 font-semibold">
              ₹{(overview.totalCollected / 100000).toFixed(2)} L
            </div>
            <span className="font-body-sm text-body-sm text-on-surface-variant pl-1 mt-0.5 block">
              Verified ledger balances
            </span>
          </div>

          <div className="bg-surface-container-low p-space-sm rounded relative">
            <div className="w-1 absolute left-0 top-1 bottom-1 bg-primary rounded-l"></div>
            <div className="flex items-center justify-between mb-1 pl-1">
              <span className="font-label-sm text-label-sm text-primary font-semibold">Pending</span>
              <span className="font-data-mono text-[11px] bg-primary-fixed text-on-primary-fixed px-1 rounded">
                {pendingPct}%
              </span>
            </div>
            <div className="font-data-mono text-headline-sm text-on-surface pl-1 font-semibold">
              ₹{(overview.totalPending / 100000).toFixed(2)} L
            </div>
            <span className="font-body-sm text-body-sm text-on-surface-variant pl-1 mt-0.5 block">
              Unpaid balances
            </span>
          </div>

          <div className="bg-surface-container-low p-space-sm rounded relative">
            <div className="w-1 absolute left-0 top-1 bottom-1 bg-error rounded-l"></div>
            <div className="flex items-center justify-between mb-1 pl-1">
              <span className="font-label-sm text-label-sm text-error font-semibold">Overdue</span>
              <span className="font-data-mono text-[11px] bg-error-container text-on-error-container px-1 rounded">
                {overduePct}%
              </span>
            </div>
            <div className="font-data-mono text-headline-sm text-error pl-1 font-semibold">
              ₹{(overview.totalOverdue / 100000).toFixed(2)} L
            </div>
            <span className="font-body-sm text-body-sm text-on-surface-variant pl-1 mt-0.5 block">
              Exceeded due threshold
            </span>
          </div>
        </div>
      </div>

      {/* MID TIER: 2-Column Split (Automations & Needs Attention) */}
      <div className="grid grid-cols-12 gap-gutter mb-space-lg">
        {/* SECTION B: Automation Activity (7 Columns) */}
        <div className="col-span-12 lg:col-span-7 bg-surface-container-lowest p-space-md rounded shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[20px]">smart_toy</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Automation Dispatch Engine</h3>
              </div>
              <span className="font-data-mono text-[11px] bg-surface-container-high px-2 py-0.5 rounded text-on-surface-variant">
                Live Dispatches
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
              {/* Greeting */}
              <div className="bg-surface-container-low p-space-sm rounded flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold">Welcome Greetings</span>
                    <span className="w-2 h-2 rounded-full bg-secondary"></span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {auto.greetings} sent this academic cycle
                  </p>
                </div>
                <div className="mt-space-sm pt-space-xs bg-surface-container-lowest px-1.5 py-1 rounded flex items-center justify-between">
                  <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Idempotency</span>
                  <span className="font-data-mono text-data-mono text-secondary font-semibold">Protected</span>
                </div>
              </div>

              {/* Fee Reminders */}
              <div className="bg-surface-container-low p-space-sm rounded flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold">Fee Reminders</span>
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {auto.feeReminders} reminders dispatched
                  </p>
                </div>
                <div className="mt-space-sm pt-space-xs bg-surface-container-lowest px-1.5 py-1 rounded flex items-center justify-between">
                  <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Auto-Cancel</span>
                  <span className="font-data-mono text-data-mono text-primary font-semibold">On Verified Pay</span>
                </div>
              </div>

              {/* Announcements */}
              <div className="bg-surface-container-low p-space-sm rounded flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold">Announcements</span>
                    <span className="w-2 h-2 rounded-full bg-secondary"></span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {auto.announcements} broadcast notices
                  </p>
                </div>
                <div className="mt-space-sm pt-space-xs bg-surface-container-lowest px-1.5 py-1 rounded flex items-center justify-between">
                  <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Channel</span>
                  <span className="font-data-mono text-data-mono text-on-surface">WhatsApp Cloud</span>
                </div>
              </div>

              {/* Staff Salary */}
              <div className="bg-surface-container-low p-space-sm rounded flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold">Staff Communications</span>
                    <span className="w-2 h-2 rounded-full bg-surface-dim"></span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {auto.staffMessages} payroll/staff updates
                  </p>
                </div>
                <div className="mt-space-sm pt-space-xs bg-surface-container-lowest px-1.5 py-1 rounded flex items-center justify-between">
                  <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Status</span>
                  <span className="font-data-mono text-data-mono text-on-surface-variant">Active</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-space-md pt-space-sm flex items-center justify-between">
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Meta Cloud Gateway Rate: 80 msgs/min
            </span>
            <button
              onClick={() => onNavigateTab('automations')}
              className="text-primary hover:text-primary-container font-label-sm text-label-sm flex items-center gap-1 transition-colors"
            >
              <span>Configure Workflows</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* SECTION D: 'Needs Attention' Operational Callouts (5 Columns) */}
        <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest p-space-md rounded shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-error text-[20px]">warning</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Needs Attention</h3>
              </div>
              <span
                className={`font-data-mono text-[11px] px-2 py-0.5 rounded font-semibold ${
                  attentionItems.length > 0
                    ? 'bg-error-container text-on-error-container'
                    : 'bg-secondary-container text-on-secondary-container'
                }`}
              >
                {attentionItems.length} {attentionItems.length === 1 ? 'Item' : 'Items'}
              </span>
            </div>

            {attentionItems.length === 0 ? (
              <div className="p-6 bg-surface-container-low rounded-lg text-center flex flex-col items-center justify-center text-on-surface-variant">
                <span className="material-symbols-outlined text-secondary text-[32px] mb-2">
                  verified
                </span>
                <p className="text-sm font-medium text-on-surface">All Operational Checks Normal</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  No sync conflicts or invalid phone records detected in ledger.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-space-xs">
                {attentionItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-space-xs bg-surface-container-low rounded flex items-center justify-between hover:bg-surface-container transition-colors"
                  >
                    <div className="flex items-center gap-space-xs min-w-0 pr-2">
                      <span
                        className={`material-symbols-outlined text-[16px] shrink-0 ${
                          item.type === 'ERROR' ? 'text-error' : 'text-tertiary'
                        }`}
                      >
                        {item.type === 'ERROR' ? 'rule' : 'contact_phone'}
                      </span>
                      <div className="min-w-0">
                        <span className="font-body-sm text-body-sm text-on-surface truncate font-medium block">
                          {item.title}
                        </span>
                        <span className="text-[11px] text-on-surface-variant truncate block">
                          {item.description}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (item.actionUrl.includes('students')) onNavigateTab('students');
                        else if (item.actionUrl.includes('sync')) onNavigateTab('sync');
                        else if (item.actionUrl.includes('messages')) onNavigateTab('messages');
                      }}
                      className="h-6 px-2 bg-surface-container-lowest text-on-surface hover:bg-surface-container-high rounded font-label-sm text-label-sm shrink-0 shadow-sm transition-colors text-xs"
                    >
                      {item.actionLabel || 'Review'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-space-md pt-space-sm border-t border-outline-variant/20 flex items-center justify-between">
            <span className="font-body-sm text-body-sm text-on-surface-variant">Ledger Protection</span>
            <span className="font-data-mono text-[11px] text-secondary font-semibold">ACTIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
};
