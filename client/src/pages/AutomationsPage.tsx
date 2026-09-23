import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { CustomAutomationModal } from '../components/CustomAutomationModal';

interface AutomationModule {
  _id?: string;
  id: string;
  type: 'GREETING' | 'FEE' | 'ANNOUNCEMENT' | 'COMPLAINT' | 'STAFF' | 'CUSTOM';
  name?: string;
  description?: string;
  enabled: boolean;
  template: string;
  schedule?: any;
  audience?: any;
  conditions?: any;
  minSendIntervalMs?: number;
  isPaused?: boolean;
  pauseReason?: string;
  circuitBreakerFailures?: number;
  eligibleCount?: number;
  metrics?: {
    totalSent?: number;
    totalDelivered?: number;
    totalFailed?: number;
    lastTriggeredAt?: string;
  };
  lastActivity?: string;
  createdAt?: string;
  updatedAt?: string;
}

const MODULE_METADATA: Record<string, { name: string; description: string; guarantee: string }> = {
  GREETING: {
    name: 'Welcome Greeting Automation (Default)',
    description:
      'Dispatches personalized WhatsApp welcome greeting once on first valid sheet detection per student per academic cycle.',
    guarantee: 'STRICTLY_ONE_TIME',
  }
};

export const AutomationsPage: React.FC = () => {
  const [automations, setAutomations] = useState<AutomationModule[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({
    eligible: 0,
    queued: 0,
    sending: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    cancelled: 0
  });
  const [isPaused, setIsPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [pacingIntervalSec, setPacingIntervalSec] = useState(10);
  const [loading, setLoading] = useState(true);
  const [togglingType, setTogglingType] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'CUSTOM' | 'SYSTEM'>('ALL');

  // Modals state
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [editingCustomAuto, setEditingCustomAuto] = useState<AutomationModule | null>(null);
  const [editingSystemAuto, setEditingSystemAuto] = useState<AutomationModule | null>(null);
  const [previewData, setPreviewData] = useState<{ title: string; rendered: string } | null>(null);
  const [templateText, setTemplateText] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [updatingPacing, setUpdatingPacing] = useState(false);
  const [isTriggeringAll, setIsTriggeringAll] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchAutomations = async () => {
    try {
      setLoading(true);
      const [res, summaryRes] = await Promise.all([
        api.getAutomations(),
        api.getAutomationSummary().catch(() => null)
      ]);
      setAutomations(res || []);
      if (res && res.length > 0) {
        setIsPaused(res.some((a: any) => a.isPaused));
        const foundReason = res.find((a: any) => a.pauseReason)?.pauseReason;
        setPauseReason(foundReason || null);
        if (res[0].minSendIntervalMs) {
          setPacingIntervalSec(Math.round(res[0].minSendIntervalMs / 1000));
        }
      }
      if (summaryRes) {
        setSummary(summaryRes);
      }
    } catch (err: any) {
      console.error('Failed to load automations from API:', err);
      setAutomations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomations();
  }, []);

  const handleToggle = async (auto: AutomationModule) => {
    const key = auto._id || auto.id || auto.type;
    setTogglingType(key);
    try {
      const nextState = !auto.enabled;
      const targetIdentifier = auto.type === 'CUSTOM' ? (auto.id || auto._id || '') : auto.type;
      const res = await api.toggleAutomation(targetIdentifier, nextState);
      setAutomations((prev) =>
        prev.map((a) => ((a.id || a._id) === (auto.id || auto._id) || a.type === auto.type ? { ...a, enabled: nextState } : a))
      );
      const queuedCount = res?.data?.queuedCount || 0;
      const displayName = auto.name || MODULE_METADATA[auto.type]?.name || auto.type;
      if (nextState && queuedCount > 0) {
        setFeedback(`✓ "${displayName}" enabled! Queued ${queuedCount} dynamic message(s).`);
      } else {
        setFeedback(`"${displayName}" switched to ${nextState ? 'ACTIVE' : 'DISABLED'}`);
      }
      fetchAutomations();
    } catch (err: any) {
      console.error('Failed to toggle automation:', err);
      setFeedback(`Error toggling: ${err.message || 'Action failed'}`);
    } finally {
      setTogglingType(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleTriggerSingle = async (auto: AutomationModule) => {
    const id = auto.id || auto._id;
    if (!id) return;
    setTriggeringId(id);
    try {
      const res = await api.triggerSingleAutomation(id);
      const queued = res?.data?.queuedCount || 0;
      setFeedback(`✓ "${auto.name || auto.type}" executed! Queued ${queued} message(s) to outbound queue.`);
      await fetchAutomations();
    } catch (err: any) {
      setFeedback(`Trigger error: ${err.message || 'Failed'}`);
    } finally {
      setTriggeringId(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleDeleteCustom = async (auto: AutomationModule) => {
    const id = auto.id || auto._id;
    if (!id) return;
    if (!window.confirm(`Are you sure you want to delete campaign "${auto.name || 'Custom Campaign'}"? This action cannot be undone.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await api.deleteCustomAutomation(id);
      setFeedback(`Campaign "${auto.name || 'Campaign'}" deleted.`);
      await fetchAutomations();
    } catch (err: any) {
      setFeedback(`Delete error: ${err.message || 'Failed'}`);
    } finally {
      setDeletingId(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleRunAllAutomationsNow = async () => {
    setIsTriggeringAll(true);
    try {
      const res = await api.triggerAutomations();
      const queued = res?.data?.totalQueued || 0;
      setFeedback(res?.message || `✓ Universal Automation Engine evaluated! Queued ${queued} message(s).`);
      await fetchAutomations();
    } catch (err: any) {
      console.error('Failed to run automations:', err);
      setFeedback(`Error running engine: ${err.message || 'Action failed'}`);
    } finally {
      setIsTriggeringAll(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handlePauseResume = async () => {
    try {
      if (isPaused) {
        await api.resumeAutomations();
        setIsPaused(false);
        setPauseReason(null);
        setFeedback('Outbound WhatsApp queue resumed. Pacing active.');
      } else {
        await api.pauseAutomations();
        setIsPaused(true);
        setPauseReason('ADMIN_MANUAL_PAUSE');
        setFeedback('Outbound WhatsApp queue paused. No new messages will dispatch.');
      }
      await fetchAutomations();
    } catch (err: any) {
      setFeedback(`Error changing queue state: ${err.message || 'Action failed'}`);
    } finally {
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handlePacingChange = async (seconds: number) => {
    setPacingIntervalSec(seconds);
    setUpdatingPacing(true);
    try {
      await api.updatePacingConfig(seconds * 1000);
      setFeedback(`Global minimum pacing updated to ${seconds}s between outbound sends`);
    } catch (err: any) {
      setFeedback(`Failed to update pacing: ${err.message}`);
    } finally {
      setUpdatingPacing(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const openSystemTemplateEditor = (auto: AutomationModule) => {
    setEditingSystemAuto(auto);
    setTemplateText(auto.template || '');
  };

  const handlePreview = async (auto: AutomationModule) => {
    try {
      const res = await api.previewAutomation(auto.template);
      setPreviewData({
        title: auto.name || MODULE_METADATA[auto.type]?.name || auto.type,
        rendered: res.rendered || auto.template
      });
    } catch (err: any) {
      setFeedback(`Preview error: ${err.message}`);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleSaveSystemTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSystemAuto) return;

    setSavingTemplate(true);
    try {
      await api.updateAutomation(editingSystemAuto.type, { template: templateText });
      setAutomations((prev) =>
        prev.map((a) => (a.type === editingSystemAuto.type ? { ...a, template: templateText } : a))
      );
      setFeedback(`Template updated for ${MODULE_METADATA[editingSystemAuto.type]?.name || editingSystemAuto.type}`);
      setEditingSystemAuto(null);
    } catch (err: any) {
      setFeedback(`Error saving template: ${err.message || 'Failed'}`);
    } finally {
      setSavingTemplate(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const customAutomations = automations.filter((a) => a.type === 'CUSTOM');
  const systemAutomations = automations.filter((a) => a.type !== 'CUSTOM');
  const filteredAutomations =
    activeTab === 'CUSTOM'
      ? customAutomations
      : activeTab === 'SYSTEM'
      ? systemAutomations
      : automations;

  return (
    <div className="flex flex-col w-full pb-10">
      {/* Toast Feedback */}
      {feedback && (
        <div className="fixed top-16 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2.5 border border-outline-variant/30 text-body-sm animate-fade-in">
          <span className="material-symbols-outlined text-secondary-fixed text-[18px]">info</span>
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="ml-2 text-outline-variant hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between py-space-sm mb-space-md flex-wrap gap-3">
        <div className="flex items-center gap-space-xs">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary shadow-sm">
            <span className="material-symbols-outlined text-[24px]">smart_toy</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight font-bold">
                Universal Automation Engine
              </h1>
              <span className="font-data-mono text-[11px] bg-primary-fixed text-on-primary-fixed px-2 py-0.5 rounded-full font-semibold">
                {customAutomations.length} Custom Campaigns | 1 Default Greeting
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">
              Dynamic Google Sheets variable targeting, custom WhatsApp campaigns, and automated rule dispatch.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setEditingCustomAuto(null);
              setIsCustomModalOpen(true);
            }}
            className="h-9 px-3.5 bg-gradient-to-r from-primary to-primary/85 text-on-primary hover:from-primary/95 hover:to-primary font-label-sm text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all"
            title="Create a new custom automation campaign with dynamic Google Sheet variables"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>New Automation Campaign</span>
          </button>

          <button
            onClick={handleRunAllAutomationsNow}
            disabled={isTriggeringAll}
            className="h-9 px-3 bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 font-label-sm text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-secondary/30 shadow-sm transition-all disabled:opacity-50"
            title="Force evaluate all active automations immediately"
          >
            <span className="material-symbols-outlined text-[16px]">bolt</span>
            <span>{isTriggeringAll ? 'Evaluating...' : 'Run All Automations'}</span>
          </button>

          <button
            onClick={fetchAutomations}
            className="h-9 px-3 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface rounded-lg font-label-sm text-xs flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Pacing & Outbound Safety Gate */}
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/25 mb-space-md">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Outbound Message Pacing & Safety
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-data-mono text-[11px] font-bold ${
                  isPaused
                    ? 'bg-error-container text-on-error-container animate-pulse'
                    : 'bg-secondary-container text-on-secondary-container'
                }`}
              >
                {isPaused ? `QUEUE PAUSED (${pauseReason || 'MANUAL'})` : `PACING ACTIVE (${pacingIntervalSec}s Gap)`}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1">
              Guarantees strict WhatsApp rate-limiting with 10s default spacing between dispatches to prevent phone bans.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/30">
              <label className="text-xs font-medium text-on-surface-variant">Send Interval:</label>
              <select
                value={pacingIntervalSec}
                onChange={(e) => handlePacingChange(Number(e.target.value))}
                disabled={updatingPacing}
                className="h-7 px-2 bg-surface-container-lowest border border-outline-variant/30 rounded text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
              >
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds (Recommended)</option>
                <option value={15}>15 seconds</option>
                <option value={20}>20 seconds</option>
                <option value={30}>30 seconds</option>
              </select>
            </div>

            <button
              onClick={handlePauseResume}
              className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm ${
                isPaused
                  ? 'bg-secondary text-on-secondary hover:bg-secondary/90'
                  : 'bg-error-container text-on-error-container hover:bg-error hover:text-on-error'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {isPaused ? 'play_arrow' : 'pause'}
              </span>
              <span>{isPaused ? 'Resume Automation Queue' : 'Pause Automation Queue'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Operational Summary Run Counter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-space-md">
        <div className="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/20 flex flex-col shadow-xs">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold">Eligible</span>
          <span className="font-headline-sm text-headline-sm font-bold text-on-surface">{summary.eligible || 0}</span>
        </div>
        <div className="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/20 flex flex-col shadow-xs">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold">Queued</span>
          <span className="font-headline-sm text-headline-sm font-bold text-outline">{summary.queued || 0}</span>
        </div>
        <div className="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/20 flex flex-col shadow-xs">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold">Sending</span>
          <span className="font-headline-sm text-headline-sm font-bold text-primary">{summary.sending || 0}</span>
        </div>
        <div className="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/20 flex flex-col shadow-xs">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold">Sent</span>
          <span className="font-headline-sm text-headline-sm font-bold text-secondary">{summary.sent || 0}</span>
        </div>
        <div className="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/20 flex flex-col shadow-xs">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold">Skipped</span>
          <span className="font-headline-sm text-headline-sm font-bold text-amber-600">{summary.skipped || 0}</span>
        </div>
        <div className="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/20 flex flex-col shadow-xs">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase font-semibold">Failed</span>
          <span className="font-headline-sm text-headline-sm font-bold text-error">{summary.failed || 0}</span>
        </div>
      </div>

      {/* Tabs Filter */}
      <div className="flex items-center justify-between border-b border-outline-variant/20 mb-space-md">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'ALL'
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span>All Automations</span>
            <span className="bg-surface-container px-1.5 py-0.2 rounded-full text-[10px]">
              {automations.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('CUSTOM')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'CUSTOM'
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">campaign</span>
            <span>Custom Campaigns</span>
            <span className="bg-primary/10 text-primary px-1.5 py-0.2 rounded-full text-[10px] font-bold">
              {customAutomations.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('SYSTEM')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'SYSTEM'
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">waving_hand</span>
            <span>Default Greeting</span>
            <span className="bg-surface-container px-1.5 py-0.2 rounded-full text-[10px]">
              {systemAutomations.length}
            </span>
          </button>
        </div>

        {customAutomations.length > 0 && activeTab !== 'SYSTEM' && (
          <span className="text-[11px] text-on-surface-variant hidden sm:inline">
            Variables resolve dynamically from Google Sheet columns
          </span>
        )}
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        {loading ? (
          <div className="col-span-2 py-16 text-center text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-[28px] text-primary">progress_activity</span>
            <p className="mt-2 text-xs">Connecting to automation engine & syncing schemas...</p>
          </div>
        ) : filteredAutomations.length === 0 ? (
          <div className="col-span-2 py-14 text-center bg-surface-container-lowest rounded-xl border border-dashed border-outline-variant/30 p-8">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[24px]">campaign</span>
            </div>
            <h3 className="font-headline-sm text-sm font-semibold text-on-surface">No campaigns match this view</h3>
            <p className="text-xs text-on-surface-variant mt-1 max-w-sm mx-auto">
              Create your first custom WhatsApp campaign with curly brace variables like <code>{"{{student_name}}"}</code>.
            </p>
            <button
              onClick={() => {
                setEditingCustomAuto(null);
                setIsCustomModalOpen(true);
              }}
              className="mt-4 px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              <span>Create Custom Campaign</span>
            </button>
          </div>
        ) : (
          filteredAutomations.map((auto) => {
            const isCustom = auto.type === 'CUSTOM';
            const meta = MODULE_METADATA[auto.type] || {
              name: auto.name || 'Custom Automation Campaign',
              description: auto.description || 'Dynamic custom automation campaign.',
              guarantee: 'ON_DEMAND_CRITERIA',
            };

            const cardKey = auto._id || auto.id || auto.type;
            const isToggling = togglingType === cardKey;
            const isTriggeringThis = triggeringId === (auto.id || auto._id);
            const isDeletingThis = deletingId === (auto.id || auto._id);

            return (
              <div
                key={cardKey}
                className={`p-space-md rounded-xl bg-surface-container-lowest border transition-all flex flex-col justify-between ${
                  auto.enabled
                    ? 'border-primary/35 shadow-sm hover:shadow-md'
                    : 'border-outline-variant/20 opacity-85'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold truncate">
                          {auto.name || meta.name}
                        </h3>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            auto.enabled ? 'bg-secondary animate-pulse' : 'bg-outline-variant'
                          }`}
                        />
                        {isCustom ? (
                          <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Custom Campaign
                          </span>
                        ) : (
                          <span className="bg-surface-container text-on-surface-variant text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            System Core
                          </span>
                        )}
                      </div>

                      {/* Subtitle / Criteria pills */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="font-data-mono text-[11px] text-primary">
                          Type: {auto.type}
                        </span>
                        {auto.eligibleCount !== undefined && (
                          <span className="font-data-mono text-[11px] bg-surface-container px-2 py-0.5 rounded-md text-on-surface-variant font-medium">
                            {auto.eligibleCount} Recipients Targeted
                          </span>
                        )}
                        {isCustom && auto.schedule?.triggerType && (
                          <span className="font-data-mono text-[10px] bg-secondary/10 text-secondary px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">
                              {auto.schedule.triggerType === 'MANUAL'
                                ? 'touch_app'
                                : auto.schedule.triggerType === 'ON_SYNC'
                                ? 'sync'
                                : auto.schedule.triggerType === 'BEFORE_DUE_DATE'
                                ? 'hourglass_top'
                                : auto.schedule.triggerType === 'AFTER_PAYMENT'
                                ? 'verified'
                                : 'schedule'}
                            </span>
                            <span>
                              {auto.schedule.triggerType === 'BEFORE_DUE_DATE'
                                ? `Due Date (${auto.schedule.offsetDays ?? -2}d)`
                                : auto.schedule.triggerType === 'AFTER_PAYMENT'
                                ? 'On Payment Success'
                                : auto.schedule.triggerType}
                            </span>
                          </span>
                        )}
                        {isCustom && auto.schedule?.maxExecutions && auto.schedule.maxExecutions > 1 && (
                          <span className="font-data-mono text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">repeat</span>
                            <span>Max {auto.schedule.maxExecutions}x ({auto.schedule.repeatIntervalDays || 2}d interval)</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      onClick={() => handleToggle(auto)}
                      disabled={isToggling}
                      className={`w-11 h-6 flex items-center rounded-full p-0.5 transition-colors duration-200 ${
                        auto.enabled ? 'bg-secondary justify-end' : 'bg-surface-container-high justify-start'
                      } disabled:opacity-50`}
                      title={`Switch ${auto.enabled ? 'off' : 'on'}`}
                    >
                      <span className="w-5 h-5 rounded-full bg-surface shadow-md block" />
                    </button>
                  </div>

                  {/* Description */}
                  <p className="text-body-sm text-on-surface-variant mt-2.5 text-xs leading-relaxed line-clamp-2">
                    {auto.description || meta.description}
                  </p>

                  {/* Custom Targeting Criteria Badges if present */}
                  {isCustom && auto.audience?.criteria && auto.audience.criteria.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[10px] text-outline uppercase font-semibold">Filter:</span>
                      {auto.audience.criteria.map((c: any, i: number) => (
                        <span
                          key={i}
                          className="text-[10px] bg-surface-container-low border border-outline-variant/30 text-on-surface px-1.5 py-0.5 rounded font-data-mono"
                        >
                          {c.field}: <strong className="text-primary">{c.value}</strong>
                        </span>
                      ))}
                      {auto.audience?.feeStatus && auto.audience.feeStatus !== 'ALL' && (
                        <span className="text-[10px] bg-surface-container-low border border-outline-variant/30 text-on-surface px-1.5 py-0.5 rounded font-data-mono">
                          Fee: <strong className="text-secondary">{auto.audience.feeStatus}</strong>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Template Preview Box */}
                  <div className="mt-3 p-2.5 bg-surface-container-low rounded-lg border border-outline-variant/20">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px] text-secondary">chat</span>
                        <span>WhatsApp Message Template</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePreview(auto)}
                          className="text-[11px] text-secondary hover:underline font-medium flex items-center gap-0.5"
                          title="Simulate template rendering with active student record"
                        >
                          <span className="material-symbols-outlined text-[13px]">visibility</span>
                          <span>Preview</span>
                        </button>
                        {isCustom ? (
                          <button
                            onClick={() => {
                              setEditingCustomAuto(auto);
                              setIsCustomModalOpen(true);
                            }}
                            className="text-[11px] text-primary hover:underline font-medium flex items-center gap-0.5"
                          >
                            <span className="material-symbols-outlined text-[13px]">edit</span>
                            <span>Edit Campaign</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => openSystemTemplateEditor(auto)}
                            className="text-[11px] text-primary hover:underline font-medium flex items-center gap-0.5"
                          >
                            <span className="material-symbols-outlined text-[13px]">edit</span>
                            <span>Edit Template</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <pre className="font-data-mono text-[11px] text-on-surface whitespace-pre-wrap line-clamp-3 bg-surface-container-lowest p-2 rounded border border-outline-variant/15">
                      {auto.template || 'No template configured.'}
                    </pre>
                  </div>
                </div>

                {/* Footer Controls & Metrics */}
                <div className="mt-4 pt-3 border-t border-outline-variant/15 flex items-center justify-between flex-wrap gap-2 text-[11px]">
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    {isCustom ? (
                      <span className="font-data-mono text-[10px] flex items-center gap-2">
                        <span>Sent: <strong className="text-secondary font-bold">{auto.metrics?.totalSent || 0}</strong></span>
                        <span>Delivered: <strong className="text-primary font-bold">{auto.metrics?.totalDelivered || 0}</strong></span>
                      </span>
                    ) : (
                      <span className="font-data-mono text-on-surface-variant">
                        Guarantee: <strong className="text-secondary">{meta.guarantee}</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isCustom && (
                      <>
                        <button
                          onClick={() => handleTriggerSingle(auto)}
                          disabled={isTriggeringThis}
                          className="px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold rounded flex items-center gap-1 transition-all disabled:opacity-50"
                          title="Evaluate and queue outbound messages for this campaign immediately"
                        >
                          <span className="material-symbols-outlined text-[13px]">bolt</span>
                          <span>{isTriggeringThis ? 'Queueing...' : 'Trigger Now'}</span>
                        </button>

                        <button
                          onClick={() => handleDeleteCustom(auto)}
                          disabled={isDeletingThis}
                          className="px-2 py-1 hover:bg-error-container text-error text-[11px] font-medium rounded flex items-center gap-0.5 transition-all disabled:opacity-50"
                          title="Delete custom campaign"
                        >
                          <span className="material-symbols-outlined text-[14px]">delete</span>
                        </button>
                      </>
                    )}

                    <span className="font-label-sm text-outline text-[11px]">
                      {auto.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Custom Automation Creator / Editor */}
      <CustomAutomationModal
        isOpen={isCustomModalOpen}
        onClose={() => {
          setIsCustomModalOpen(false);
          setEditingCustomAuto(null);
        }}
        onSaved={() => {
          fetchAutomations();
          setFeedback(editingCustomAuto ? 'Campaign updated successfully!' : 'New campaign created and activated!');
          setTimeout(() => setFeedback(null), 4000);
        }}
        initialData={editingCustomAuto}
      />

      {/* Modal: Edit System Template */}
      {editingSystemAuto && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-space-lg shadow-2xl border border-outline-variant/30">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Edit System WhatsApp Template
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {MODULE_METADATA[editingSystemAuto.type]?.name || editingSystemAuto.type}
                </p>
              </div>
              <button onClick={() => setEditingSystemAuto(null)} className="text-outline hover:text-on-surface">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveSystemTemplate} className="space-y-3">
              <div>
                <label className="font-label-sm text-on-surface-variant block mb-1 text-xs">
                  Template Body (Supports variables like <code>{"{{student_name}}"}</code>, <code>{"{{college_name}}"}</code>, <code>{"{{balance}}"}</code>, <code>{"{{due_date}}"}</code>)
                </label>
                <textarea
                  rows={6}
                  value={templateText}
                  onChange={(e) => setTemplateText(e.target.value)}
                  className="w-full p-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-body-sm font-data-mono text-on-surface focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSystemAuto(null)}
                  className="px-3.5 py-1.5 rounded-lg text-label-sm text-on-surface-variant hover:bg-surface-container text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTemplate}
                  className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold hover:bg-primary/90 disabled:opacity-50 text-xs shadow-sm"
                >
                  {savingTemplate ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Preview Rendered Template Simulation */}
      {previewData && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-md w-full p-space-lg shadow-2xl border border-outline-variant/30">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-secondary/15 flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                </div>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Template WhatsApp Preview
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    {previewData.title}
                  </p>
                </div>
              </div>
              <button onClick={() => setPreviewData(null)} className="text-outline hover:text-on-surface">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-[#efeae2] dark:bg-[#121b22] rounded-xl border border-outline-variant/20">
                <span className="text-[10px] text-on-surface-variant uppercase font-semibold block mb-1.5">
                  Simulated WhatsApp Message Bubble
                </span>
                <div className="bg-[#d9fdd3] dark:bg-[#005c4b] p-3 rounded-lg text-xs text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap font-sans shadow-sm">
                  {previewData.rendered}
                  <div className="text-[9px] text-right text-black/50 dark:text-white/60 mt-1">
                    Just now · ✓✓
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                * Previews resolve dynamic tags against the latest live student record from your Google Sheet or database.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-outline-variant/20 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewData(null)}
                className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
