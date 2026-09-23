import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface ConflictRecord {
  id: string;
  studentId: string;
  studentName: string;
  registerNo: string;
  course: string;
  field: string;
  applicationValue: any;
  sourceValue: any;
  status: 'OPEN' | 'RESOLVED';
  detectedAt: string;
  resolution?: string;
}

interface ConnectionInfo {
  id: string;
  provider: string;
  status: string;
  accountReference: string;
  fileReference?: string;
  sheetReference: string;
  lastSyncAt?: string;
  syncStatus?: string;
  metrics?: {
    rowsRead: number;
    rowsAdded: number;
    rowsUpdated: number;
    rowsSkipped: number;
    rowsInvalid: number;
    rowsConflicted: number;
  };
  columnMapping?: Record<string, string>;
}

export const SyncPage: React.FC = () => {
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [resolutionMessage, setResolutionMessage] = useState<string | null>(null);

  // Google Connection & Spreadsheet Selection State
  const [spreadsheets, setSpreadsheets] = useState<Array<{ id: string; name: string; modifiedTime: string }>>([]);
  const [loadingSpreadsheets, setLoadingSpreadsheets] = useState(false);
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState('');
  const [manualSpreadsheetInput, setManualSpreadsheetInput] = useState('');
  const [availableTabs, setAvailableTabs] = useState<Array<{ sheetId: number; title: string }>>([]);
  const [selectedTab, setSelectedTab] = useState('Students_Master');
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Column Mapping State
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [discoveredColumns, setDiscoveredColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [savingMapping, setSavingMapping] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [conflictsRes, statusRes] = await Promise.allSettled([
        api.getSyncConflicts(),
        api.getSyncStatus(),
      ]);

      if (conflictsRes.status === 'fulfilled') {
        const raw: any = conflictsRes.value;
        setConflicts(Array.isArray(raw) ? raw : raw?.conflicts || []);
      } else {
        console.warn('Failed to load conflicts:', conflictsRes.reason);
        setConflicts([]);
      }

      if (statusRes.status === 'fulfilled') {
        const conns = statusRes.value?.connections || [];
        const activeConn = conns[0] || null;
        setConnection(activeConn);
        if (activeConn?.fileReference) {
          setSelectedSpreadsheetId(activeConn.fileReference);
        }
        if (activeConn?.sheetReference) {
          setSelectedTab(activeConn.sheetReference);
        }
        if (activeConn?.columnMapping) {
          setColumnMapping(activeConn.columnMapping);
        }
      }
    } catch (err) {
      console.error('Failed to load sync data:', err);
      setConflicts([]);
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

    // Check for query params from OAuth redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      setResolutionMessage('Google account successfully connected! Please select your spreadsheet.');
      window.history.replaceState({}, document.title, window.location.pathname);
      handleOpenSpreadsheetPicker();
    } else if (params.get('error')) {
      setResolutionMessage(`Google OAuth error: ${params.get('error')}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return () => {
      window.removeEventListener('campusflow:data-updated', onDataUpdated);
    };
  }, []);

  const handleConnectGoogle = async () => {
    try {
      setResolutionMessage('Initiating Google OAuth connection...');
      const res = await api.getGoogleAuthUrl();
      if (res?.authUrl) {
        window.location.href = res.authUrl;
      }
    } catch (err: any) {
      setResolutionMessage(`Failed to initiate Google OAuth: ${err.message || 'Error'}`);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Sheets? Synchronization will be paused.')) return;
    try {
      await api.disconnectGoogle();
      setResolutionMessage('Google Sheets connection disconnected.');
      await loadData();
    } catch (err: any) {
      alert(`Error disconnecting: ${err.message}`);
    }
  };

  const handleOpenSpreadsheetPicker = async () => {
    setShowConfigModal(true);
    setLoadingSpreadsheets(true);
    try {
      const res = await api.getGoogleSpreadsheets();
      setSpreadsheets(res.spreadsheets || []);
      if (res.currentSpreadsheetId) {
        setSelectedSpreadsheetId(res.currentSpreadsheetId);
      }
    } catch (err: any) {
      console.warn('Could not list drive spreadsheets automatically:', err.message);
    } finally {
      setLoadingSpreadsheets(false);
    }
  };

  const handleBindSpreadsheet = async (spreadsheetIdToBind: string) => {
    if (!spreadsheetIdToBind.trim()) return;
    try {
      setLoadingSpreadsheets(true);
      const res = await api.selectGoogleSpreadsheet({
        spreadsheetId: spreadsheetIdToBind.trim(),
        sheetReference: selectedTab
      });
      setSelectedSpreadsheetId(res.spreadsheetId);
      setAvailableTabs(res.tabs || []);
      setSelectedTab(res.activeTab);
      setResolutionMessage(`Successfully bound to spreadsheet "${res.spreadsheetTitle}"`);
      await loadData();
    } catch (err: any) {
      alert(`Error binding spreadsheet: ${err.message}`);
    } finally {
      setLoadingSpreadsheets(false);
    }
  };

  const handleOpenMappingModal = async () => {
    try {
      setSavingMapping(true);
      setShowMappingModal(true);
      const res = await api.discoverColumns(selectedTab);
      setDiscoveredColumns(res.columns || []);
      setColumnMapping(res.suggestedMapping || {});
    } catch (err: any) {
      alert(`Error reading sheet columns: ${err.message}`);
    } finally {
      setSavingMapping(false);
    }
  };

  const handleSaveMapping = async () => {
    try {
      setSavingMapping(true);
      await api.saveColumnMapping(columnMapping);
      setResolutionMessage('Column mapping confirmed and saved.');
      setShowMappingModal(false);
      await loadData();
    } catch (err: any) {
      alert(`Error saving mapping: ${err.message}`);
    } finally {
      setSavingMapping(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setResolutionMessage('Running external Google Spreadsheet synchronization...');
    try {
      const res = await api.triggerSync();
      const metrics = res?.metrics || res;
      setResolutionMessage(
        `Sync complete! Read: ${metrics.rowsRead ?? 0}, Added: ${metrics.rowsAdded ?? 0}, Updated: ${metrics.rowsUpdated ?? 0}, Conflicts: ${metrics.rowsConflicted ?? 0}`
      );
      await loadData();
    } catch (err: any) {
      setResolutionMessage(`Sync error: ${err.message || 'Synchronization failed'}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setResolutionMessage(null), 6000);
    }
  };

  const handleResolve = async (conflictId: string, resolution: 'KEEP_VERIFIED_VALUE' | 'ACCEPT_SOURCE_CHANGE') => {
    try {
      await api.resolveSyncConflict(conflictId, {
        resolution,
        notes: `Resolved via UI Operations Console: ${resolution}`,
      });
      setResolutionMessage(
        resolution === 'KEEP_VERIFIED_VALUE'
          ? 'Application ledger verified value retained. Spreadsheet discrepancy dismissed.'
          : 'Source spreadsheet value accepted into ledger.'
      );
      await loadData();
    } catch (err: any) {
      alert(`Resolution error: ${err.message || 'Action failed'}`);
    } finally {
      setTimeout(() => setResolutionMessage(null), 5000);
    }
  };

  const isGoogleConnected = connection?.status === 'CONNECTED' && connection?.accountReference && !connection.accountReference.includes('mock');

  return (
    <div className="flex flex-col w-full pb-10">
      {/* Toast Notification */}
      {resolutionMessage && (
        <div className="fixed top-16 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-2.5 rounded shadow-lg flex items-center gap-2 border border-outline-variant/30 text-body-sm animate-fade-in max-w-md">
          <span className="material-symbols-outlined text-secondary-fixed text-[18px]">info</span>
          <span>{resolutionMessage}</span>
          <button onClick={() => setResolutionMessage(null)} className="ml-auto text-outline-variant hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between py-space-sm mb-space-md flex-wrap gap-3">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary text-[24px]">cloud_sync</span>
          <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">
            Data Source Synchronization & Integrity
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {isGoogleConnected ? (
            <>
              <button
                onClick={handleOpenSpreadsheetPicker}
                className="h-8 px-space-sm bg-surface-container hover:bg-surface-container-high text-on-surface rounded font-label-sm text-label-sm flex items-center gap-1.5 border border-outline-variant/30 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">edit_document</span>
                <span>Select Spreadsheet / Tabs</span>
              </button>
              <button
                onClick={handleOpenMappingModal}
                className="h-8 px-space-sm bg-surface-container hover:bg-surface-container-high text-on-surface rounded font-label-sm text-label-sm flex items-center gap-1.5 border border-outline-variant/30 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">alt_route</span>
                <span>Column Mapping</span>
              </button>
              <button
                onClick={handleSyncNow}
                disabled={syncing}
                className="h-8 px-space-md bg-primary hover:bg-primary-container text-on-primary rounded font-label-sm text-label-sm flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[16px] ${syncing ? 'animate-spin' : ''}`}>
                  sync
                </span>
                <span>{syncing ? 'Synchronizing...' : 'Sync Now'}</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleConnectGoogle}
              className="h-8 px-space-md bg-primary hover:bg-primary-container text-on-primary rounded font-label-sm text-label-sm flex items-center gap-1.5 shadow-sm transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">link</span>
              <span>Connect Google Sheets</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary Connection Card */}
      <div className="bg-surface-container-lowest p-space-md rounded shadow-sm border border-outline-variant/20 mb-space-lg">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded flex items-center justify-center ${isGoogleConnected ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}`}>
              <span className="material-symbols-outlined text-[28px]">table_chart</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-headline-sm font-semibold text-on-surface">
                  Google Sheets Integration
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-data-mono text-[10px] font-bold ${
                    isGoogleConnected
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'bg-error-container text-on-error-container'
                  }`}
                >
                  {isGoogleConnected ? 'CONNECTED' : 'DISCONNECTED / AUTH REQUIRED'}
                </span>
              </div>

              <p className="text-body-sm text-on-surface-variant mt-1">
                {isGoogleConnected ? (
                  <>
                    Authorized Account: <strong className="text-on-surface">{connection?.accountReference}</strong> • Target Tab:{' '}
                    <code className="font-data-mono text-primary font-semibold">{connection?.sheetReference || 'Students_Master'}</code>
                  </>
                ) : (
                  'Google OAuth authorization required to read institution spreadsheets.'
                )}
              </p>

              {connection?.fileReference && (
                <p className="text-[12px] font-data-mono text-outline mt-0.5">
                  Spreadsheet ID: {connection.fileReference}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-space-md text-right flex-wrap">
            <div>
              <span className="font-label-sm text-on-surface-variant block">Auto-Sync Cadence</span>
              <span className="font-data-mono text-body-sm font-semibold text-on-surface">Every 60 Seconds</span>
            </div>
            <div>
              <span className="font-label-sm text-on-surface-variant block">Last Ingestion</span>
              <span className="font-data-mono text-body-sm text-secondary font-semibold">
                {connection?.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleTimeString() : 'Awaiting sync'}
              </span>
            </div>
            {isGoogleConnected && (
              <button
                onClick={handleDisconnectGoogle}
                className="px-2.5 py-1 text-error hover:bg-error-container/20 rounded text-label-sm transition-colors border border-error/20"
                title="Disconnect Google account"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {/* Sync Metrics Bar if available */}
        {connection?.metrics && (
          <div className="mt-4 pt-4 border-t border-outline-variant/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-surface-container-low p-2 rounded">
              <span className="text-[11px] text-on-surface-variant block">Rows Read</span>
              <span className="font-data-mono font-bold text-on-surface text-body-md">{connection.metrics.rowsRead}</span>
            </div>
            <div className="bg-surface-container-low p-2 rounded">
              <span className="text-[11px] text-on-surface-variant block">Rows Ingested</span>
              <span className="font-data-mono font-bold text-secondary text-body-md">{connection.metrics.rowsAdded + connection.metrics.rowsUpdated}</span>
            </div>
            <div className="bg-surface-container-low p-2 rounded">
              <span className="text-[11px] text-on-surface-variant block">Invalid Rows</span>
              <span className="font-data-mono font-bold text-error text-body-md">{connection.metrics.rowsInvalid}</span>
            </div>
            <div className="bg-surface-container-low p-2 rounded">
              <span className="text-[11px] text-on-surface-variant block">Discrepancies</span>
              <span className="font-data-mono font-bold text-error text-body-md">{connection.metrics.rowsConflicted}</span>
            </div>
          </div>
        )}
      </div>

      {/* Sync Conflicts Section */}
      <div className="bg-surface-container-lowest p-space-md rounded shadow-sm border border-outline-variant/20">
        <div className="flex items-center justify-between mb-space-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error text-[20px]">warning</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Protected Ledger Sync Conflicts</h2>
          </div>
          <span
            className={`font-data-mono text-[11px] px-2 py-0.5 rounded font-semibold ${
              conflicts.filter((c) => c.status === 'OPEN').length > 0
                ? 'bg-error-container text-on-error-container'
                : 'bg-secondary-container text-on-secondary-container'
            }`}
          >
            {conflicts.filter((c) => c.status === 'OPEN').length} OPEN DISCREPANCIES
          </span>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
            <span className="ml-2">Auditing synchronization integrity...</span>
          </div>
        ) : conflicts.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant text-body-sm">
            <span className="material-symbols-outlined text-secondary text-[36px] block mb-2">check_circle</span>
            <p className="font-medium text-on-surface text-base">All Ledger Values Fully Verified</p>
            <p className="text-xs text-on-surface-variant mt-1">
              External spreadsheet records match the verified payment ledger. Zero conflicts detected.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {conflicts.map((conf) => (
              <div
                key={conf.id}
                className="p-space-md rounded bg-surface-container-low border border-error/30 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-on-surface">{conf.studentName}</span>
                      <span className="font-data-mono text-[11px] text-on-surface-variant">
                        ({conf.registerNo})
                      </span>
                      <span
                        className={`px-2 py-0.2 rounded font-data-mono text-[10px] font-bold ${
                          conf.status === 'OPEN'
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-secondary-container text-on-secondary-container'
                        }`}
                      >
                        {conf.status}
                      </span>
                    </div>
                    <p className="text-body-sm text-error mt-1">
                      Field: <strong>{conf.field}</strong> — Spreadsheet changed verified value without server payment record.
                    </p>
                  </div>

                  {conf.status === 'OPEN' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleResolve(conf.id, 'KEEP_VERIFIED_VALUE')}
                        className="px-3 py-1 bg-secondary text-on-secondary hover:bg-secondary/90 rounded text-label-sm font-semibold shadow-sm transition-all"
                        title="Protect immutable ledger value"
                      >
                        Keep Ledger Value (Protect Ledger)
                      </button>
                      <button
                        onClick={() => handleResolve(conf.id, 'ACCEPT_SOURCE_CHANGE')}
                        className="px-3 py-1 bg-surface-container-lowest text-on-surface hover:bg-surface-container border border-outline-variant/30 rounded text-label-sm transition-colors"
                        title="Allow external edit"
                      >
                        Accept Spreadsheet Change
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface-container-lowest p-space-sm rounded border border-outline-variant/20">
                  <div>
                    <span className="font-label-sm text-on-surface-variant block">Verified Ledger Value</span>
                    <span className="font-data-mono font-bold text-secondary text-headline-sm">
                      ₹{Number(conf.applicationValue !== undefined && conf.applicationValue !== null ? conf.applicationValue : 0).toLocaleString('en-IN')}
                    </span>
                    <span className="text-[11px] text-outline block mt-0.5">
                      Protected by server-side verification ledger
                    </span>
                  </div>

                  <div>
                    <span className="font-label-sm text-on-surface-variant block">Spreadsheet Source Value</span>
                    <span className="font-data-mono font-bold text-error text-headline-sm">
                      ₹{Number(conf.sourceValue !== undefined && conf.sourceValue !== null ? conf.sourceValue : 0).toLocaleString('en-IN')}
                    </span>
                    <span className="text-[11px] text-outline block mt-0.5">
                      Detected during spreadsheet polling
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spreadsheet Selector Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg max-w-xl w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">folder_open</span>
                <h3 className="font-headline-sm font-semibold text-on-surface">Select Google Spreadsheet</h3>
              </div>
              <button onClick={() => setShowConfigModal(false)} className="text-on-surface-variant hover:text-on-surface">
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4">
              {/* Option A: Pick from Drive */}
              <div>
                <label className="block text-body-sm font-medium text-on-surface mb-2">
                  Accessible Spreadsheets in Google Drive:
                </label>
                {loadingSpreadsheets ? (
                  <div className="py-4 text-center text-on-surface-variant text-body-sm flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    <span>Scanning Google Drive...</span>
                  </div>
                ) : spreadsheets.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-2 border border-outline-variant/20 rounded p-2 bg-surface-container-low">
                    {spreadsheets.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => {
                          setSelectedSpreadsheetId(s.id);
                          handleBindSpreadsheet(s.id);
                        }}
                        className={`p-2.5 rounded cursor-pointer flex items-center justify-between transition-all ${
                          selectedSpreadsheetId === s.id
                            ? 'bg-primary-container text-on-primary-container font-semibold'
                            : 'hover:bg-surface-container text-on-surface'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="material-symbols-outlined text-[18px] text-primary">description</span>
                          <span className="truncate">{s.name}</span>
                        </div>
                        <span className="text-[10px] text-outline font-data-mono shrink-0">
                          {s.id.slice(0, 10)}...
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant italic">No spreadsheets returned automatically by Drive API.</p>
                )}
              </div>

              {/* Option B: Direct URL / ID Input */}
              <div>
                <label className="block text-body-sm font-medium text-on-surface mb-1">
                  Or Paste Spreadsheet URL / Spreadsheet ID:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualSpreadsheetInput}
                    onChange={(e) => setManualSpreadsheetInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit"
                    className="flex-1 px-3 py-2 text-body-sm bg-surface-container border border-outline-variant/40 rounded text-on-surface focus:outline-none focus:border-primary font-data-mono text-xs"
                  />
                  <button
                    onClick={() => handleBindSpreadsheet(manualSpreadsheetInput)}
                    disabled={!manualSpreadsheetInput.trim() || loadingSpreadsheets}
                    className="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded text-label-sm font-semibold transition-all disabled:opacity-50"
                  >
                    Bind
                  </button>
                </div>
              </div>

              {/* Tab Selector if available */}
              {availableTabs.length > 0 && (
                <div>
                  <label className="block text-body-sm font-medium text-on-surface mb-1">
                    Select Student Master Tab:
                  </label>
                  <select
                    value={selectedTab}
                    onChange={(e) => {
                      setSelectedTab(e.target.value);
                      api.selectGoogleTabs({ studentMasterSheet: e.target.value });
                    }}
                    className="w-full px-3 py-2 text-body-sm bg-surface-container border border-outline-variant/40 rounded text-on-surface focus:outline-none focus:border-primary font-data-mono text-xs"
                  >
                    {availableTabs.map((t) => (
                      <option key={t.sheetId} value={t.title}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant/20">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface rounded text-label-sm font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column Mapping Modal */}
      {showMappingModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-lg max-w-2xl w-full p-6 shadow-2xl animate-fade-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">alt_route</span>
                <h3 className="font-headline-sm font-semibold text-on-surface">Confirm Column Mapping</h3>
              </div>
              <button onClick={() => setShowMappingModal(false)} className="text-on-surface-variant hover:text-on-surface">
                ✕
              </button>
            </div>

            <p className="text-xs text-on-surface-variant mt-2 mb-4">
              Map spreadsheet header columns to standard AlphaXync fields. Critical fields (<code className="text-primary font-bold">externalStudentId, name, whatsappNumber</code>) must be mapped.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {discoveredColumns.map((col) => (
                <div key={col} className="flex items-center justify-between gap-4 p-2 bg-surface-container-low rounded border border-outline-variant/20">
                  <span className="font-data-mono text-xs font-semibold text-on-surface">{col}</span>
                  <span className="material-symbols-outlined text-[16px] text-outline">arrow_forward</span>
                  <select
                    value={columnMapping[col] || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, [col]: e.target.value })}
                    className="px-2.5 py-1 text-xs bg-surface-container border border-outline-variant/40 rounded text-on-surface focus:outline-none focus:border-primary font-data-mono"
                  >
                    <option value="">-- Ignore Column --</option>
                    <option value="externalStudentId">externalStudentId (Register No)</option>
                    <option value="name">name (Student Name)</option>
                    <option value="fatherName">fatherName (Parent Name)</option>
                    <option value="motherName">motherName (Mother Name)</option>
                    <option value="whatsappNumber">whatsappNumber (Mobile No)</option>
                    <option value="course">course (Course / Degree)</option>
                    <option value="department">department (Department)</option>
                    <option value="year">year (Study Year)</option>
                    <option value="section">section (Section / Batch)</option>
                    <option value="totalFee">totalFee (Prescribed Fee)</option>
                    <option value="paidAmount">paidAmount (Paid Amount Reference)</option>
                    <option value="dueDate">dueDate (Due Date)</option>
                    <option value="fineAmount">fineAmount (Fine Amount)</option>
                    <option value="status">status (Enrollment Status)</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant/20 mt-4">
              <button
                onClick={() => setShowMappingModal(false)}
                className="px-4 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface rounded text-label-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMapping}
                disabled={savingMapping}
                className="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded text-label-sm font-semibold transition-all disabled:opacity-50"
              >
                {savingMapping ? 'Saving...' : 'Save & Confirm Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
