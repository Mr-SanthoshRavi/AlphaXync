import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface MessageRecord {
  id: string;
  recipient: string;
  studentName: string;
  registerNo: string;
  templateName: string;
  body?: string;
  status:
    | 'QUEUED'
    | 'WAITING'
    | 'SENDING'
    | 'SENT'
    | 'DELIVERED'
    | 'READ'
    | 'FAILED'
    | 'RETRY_PENDING'
    | 'CANCELLED'
    | 'SKIPPED';
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  failureReason?: string;
}

export const MessagesPage: React.FC = () => {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({
    queued: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    total: 0
  });
  const [pagination, setPagination] = useState<{ total: number; page: number; limit: number; pages: number }>({
    total: 0,
    page: 1,
    limit: 25,
    pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MessageRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Test Message Modal state (Rule 19)
  const [showTestModal, setShowTestModal] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [testBody, setTestBody] = useState('Verification ping from AlphaXync Admin.');
  const [sendingTest, setSendingTest] = useState(false);

  const fetchMessages = async (page = 1) => {
    try {
      setLoading(true);
      const [res, statsRes] = await Promise.all([
        api.getMessages({
          search: search.trim() || undefined,
          status: statusFilter || undefined,
          page,
          limit: 25,
        }),
        api.getMessageStats().catch(() => null)
      ]);
      setMessages(res.messages || []);
      if (res.pagination) {
        setPagination(res.pagination);
      }
      if (statsRes) {
        setStats(statsRes);
      }
    } catch (err: any) {
      console.error('Failed to load messages from API:', err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages(1);
  }, [search, statusFilter]);

  const handleRetry = async (msg: MessageRecord) => {
    setRetryingId(msg.id);
    try {
      await api.retryMessage(msg.id);
      setToast(`Retry queued for message to ${msg.recipient}`);
      await fetchMessages(pagination.page);
    } catch (err: any) {
      setToast(`Retry failed: ${err.message || 'Error'}`);
    } finally {
      setRetryingId(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient.trim()) return;

    setSendingTest(true);
    try {
      await api.sendTestMessage(testRecipient.trim(), testBody.trim());
      setToast(`Test message queued for ${testRecipient.trim()} with 10s pacing gate`);
      setShowTestModal(false);
      setTestRecipient('');
      await fetchMessages(1);
    } catch (err: any) {
      setToast(`Test send failed: ${err.message || 'Action failed'}`);
    } finally {
      setSendingTest(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'DELIVERED':
        return (
          <span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-data-mono text-[11px] font-semibold">
            DELIVERED
          </span>
        );
      case 'READ':
        return (
          <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-data-mono text-[11px] font-semibold">
            READ
          </span>
        );
      case 'SENT':
        return (
          <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-data-mono text-[11px] font-semibold">
            SENT
          </span>
        );
      case 'SENDING':
        return (
          <span className="px-2 py-0.5 rounded bg-primary/20 text-primary animate-pulse font-data-mono text-[11px] font-semibold">
            SENDING...
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2 py-0.5 rounded bg-surface-container text-outline font-data-mono text-[11px] font-semibold">
            CANCELLED
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 font-data-mono text-[11px] font-semibold">
            SKIPPED
          </span>
        );
      case 'RETRY_PENDING':
        return (
          <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-700 font-data-mono text-[11px] font-semibold">
            RETRY_PENDING
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2 py-0.5 rounded bg-error-container text-on-error-container font-data-mono text-[11px] font-semibold">
            FAILED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-surface-container text-outline font-data-mono text-[11px] font-semibold">
            QUEUED
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col w-full pb-10">
      {/* Toast Feedback */}
      {toast && (
        <div className="fixed top-16 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-2 rounded shadow-lg flex items-center gap-2 border border-outline-variant/30 text-body-sm animate-fade-in">
          <span className="material-symbols-outlined text-secondary-fixed text-[18px]">info</span>
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-outline-variant hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between py-space-sm mb-space-md flex-wrap gap-3">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary text-[24px]">chat</span>
          <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">
            WhatsApp Communications Log
          </h1>
          <span className="font-data-mono text-[11px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded font-semibold ml-2">
            GLOBAL PACING (10s)
          </span>
          <span className="font-data-mono text-[12px] bg-surface-container px-2 py-0.5 rounded text-on-surface-variant ml-2">
            {pagination.total} Dispatches
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowTestModal(true)}
            className="h-8 px-space-sm bg-primary text-on-primary hover:bg-primary/90 rounded font-label-sm text-label-sm font-semibold flex items-center gap-1 shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">send</span>
            <span>Send Test Message</span>
          </button>

          {/* Filters */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-[16px]">search</span>
            <input
              type="text"
              placeholder="Search recipient, template..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 pr-3 bg-surface-container-lowest border border-outline-variant/30 rounded text-body-sm text-on-surface focus:outline-none focus:border-primary w-52"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2 bg-surface-container-lowest border border-outline-variant/30 rounded text-label-sm text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="">All Delivery Statuses</option>
            <option value="QUEUED">Queued / Waiting</option>
            <option value="SENDING">Sending</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="READ">Read</option>
            <option value="FAILED">Failed</option>
            <option value="SKIPPED">Skipped</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <button
            onClick={() => fetchMessages(pagination.page)}
            className="h-8 px-space-sm bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-on-surface rounded font-label-sm text-label-sm flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Backend Operational Counters (Rule 53) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-space-md">
        <div className="bg-surface-container-lowest p-2.5 rounded border border-outline-variant/20 flex flex-col">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Queued</span>
          <span className="font-headline-sm text-headline-sm font-bold text-outline">{stats.queued || 0}</span>
        </div>
        <div className="bg-surface-container-lowest p-2.5 rounded border border-outline-variant/20 flex flex-col">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Sending</span>
          <span className="font-headline-sm text-headline-sm font-bold text-primary">{stats.sending || 0}</span>
        </div>
        <div className="bg-surface-container-lowest p-2.5 rounded border border-outline-variant/20 flex flex-col">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Sent</span>
          <span className="font-headline-sm text-headline-sm font-bold text-secondary">{stats.sent || 0}</span>
        </div>
        <div className="bg-surface-container-lowest p-2.5 rounded border border-outline-variant/20 flex flex-col">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Skipped</span>
          <span className="font-headline-sm text-headline-sm font-bold text-amber-600">{stats.skipped || 0}</span>
        </div>
        <div className="bg-surface-container-lowest p-2.5 rounded border border-outline-variant/20 flex flex-col">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Failed</span>
          <span className="font-headline-sm text-headline-sm font-bold text-error">{stats.failed || 0}</span>
        </div>
        <div className="bg-surface-container-lowest p-2.5 rounded border border-outline-variant/20 flex flex-col">
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Cancelled</span>
          <span className="font-headline-sm text-headline-sm font-bold text-on-surface-variant">{stats.cancelled || 0}</span>
        </div>
      </div>

      {/* Messages Table */}
      <div className="bg-surface-container-lowest rounded shadow-sm border border-outline-variant/20 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/25 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4">Student & Roll No</th>
              <th className="py-2.5 px-4">Recipient WhatsApp</th>
              <th className="py-2.5 px-4">Workflow Template</th>
              <th className="py-2.5 px-4">Timestamp</th>
              <th className="py-2.5 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/15 text-body-sm text-on-surface">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-on-surface-variant">
                  <div className="flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                    <span>Loading message log from database...</span>
                  </div>
                </td>
              </tr>
            ) : messages.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[32px] text-outline block mb-1">chat_error</span>
                  <p className="font-medium text-on-surface">No communications logged</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Messages dispatched by greetings or fee reminder engines will appear here.
                  </p>
                </td>
              </tr>
            ) : (
              messages.map((msg) => (
                <tr
                  key={msg.id}
                  onClick={() => setSelectedMessage(msg)}
                  className="hover:bg-surface-container-low/60 transition-colors cursor-pointer"
                >
                  <td className="py-2.5 px-4">{getStatusBadge(msg.status)}</td>
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-on-surface">{msg.studentName}</div>
                    <div className="font-data-mono text-[11px] text-on-surface-variant">{msg.registerNo}</div>
                  </td>
                  <td className="py-2.5 px-4 font-data-mono font-semibold">{msg.recipient}</td>
                  <td className="py-2.5 px-4 font-medium text-on-surface">{msg.templateName}</td>
                  <td className="py-2.5 px-4 text-[12px] text-on-surface-variant">
                    {msg.sentAt ? new Date(msg.sentAt).toLocaleString() : 'Queued'}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {msg.status === 'FAILED' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetry(msg);
                        }}
                        disabled={retryingId === msg.id}
                        className="px-2.5 py-1 bg-error-container text-on-error-container hover:bg-error hover:text-on-error rounded font-label-sm text-[11px] transition-colors"
                      >
                        {retryingId === msg.id ? 'Retrying...' : 'Retry'}
                      </button>
                    ) : (
                      <span className="material-symbols-outlined text-[18px] text-secondary">
                        {msg.status === 'READ' ? 'done_all' : msg.status === 'DELIVERED' ? 'done_all' : 'check'}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {pagination.pages > 1 && (
          <div className="p-3 bg-surface-container-low border-t border-outline-variant/20 flex items-center justify-between text-xs text-on-surface-variant">
            <span>
              Page {pagination.page} of {pagination.pages} ({pagination.total} total logs)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchMessages(pagination.page - 1)}
                className="px-2.5 py-1 rounded bg-surface-container border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container-high"
              >
                Previous
              </button>
              <button
                disabled={pagination.page >= pagination.pages}
                onClick={() => fetchMessages(pagination.page + 1)}
                className="px-2.5 py-1 rounded bg-surface-container border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container-high"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal / Dialog: View Message Content */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-lg max-w-md w-full p-space-lg shadow-2xl border border-outline-variant/30">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Message Details</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  To: {selectedMessage.recipient} ({selectedMessage.studentName})
                </p>
              </div>
              <button onClick={() => setSelectedMessage(null)} className="text-outline hover:text-on-surface">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs bg-surface-container-low p-2 rounded">
                <span className="text-on-surface-variant">Template: <strong>{selectedMessage.templateName}</strong></span>
                <span>{getStatusBadge(selectedMessage.status)}</span>
              </div>

              {selectedMessage.body && (
                <div>
                  <label className="text-xs text-on-surface-variant block mb-1">Message Content:</label>
                  <pre className="p-2.5 bg-surface-container-low rounded border border-outline-variant/20 text-xs font-data-mono whitespace-pre-wrap">
                    {selectedMessage.body}
                  </pre>
                </div>
              )}

              {selectedMessage.failureReason && (
                <div className="p-2.5 bg-error-container/20 border border-error/30 rounded text-xs text-error">
                  <span className="font-semibold block mb-0.5">Failure Reason:</span>
                  <span>{selectedMessage.failureReason}</span>
                </div>
              )}

              <div className="text-[11px] text-on-surface-variant space-y-0.5 pt-1">
                <div>Sent At: {selectedMessage.sentAt ? new Date(selectedMessage.sentAt).toLocaleString() : 'Queued'}</div>
                {selectedMessage.deliveredAt && (
                  <div>Delivered At: {new Date(selectedMessage.deliveredAt).toLocaleString()}</div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-outline-variant/20 flex justify-end gap-2">
              {selectedMessage.status === 'FAILED' && (
                <button
                  onClick={() => {
                    handleRetry(selectedMessage);
                    setSelectedMessage(null);
                  }}
                  className="px-3 py-1.5 rounded bg-error text-on-error text-xs font-semibold"
                >
                  Retry Dispatch
                </button>
              )}
              <button
                onClick={() => setSelectedMessage(null)}
                className="px-3 py-1.5 rounded bg-surface-container text-on-surface text-xs hover:bg-surface-container-high"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Dialog: Send Explicit Test Message (Rule 19) */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-lg max-w-md w-full p-space-lg shadow-2xl border border-outline-variant/30">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Send Explicit Test WhatsApp</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Sends a controlled test notification prefixed with <strong>[TEST]</strong>.
                </p>
              </div>
              <button onClick={() => setShowTestModal(false)} className="text-outline hover:text-on-surface">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSendTestMessage} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-on-surface-variant block mb-1">
                  Recipient WhatsApp Mobile Number (e.g. 9876543210 or +919876543210)
                </label>
                <input
                  type="text"
                  required
                  placeholder="+91 98765 43210"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  className="w-full h-9 px-3 rounded bg-surface-container-low border border-outline-variant/30 text-sm font-data-mono text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-on-surface-variant block mb-1">
                  Test Message Body
                </label>
                <textarea
                  rows={4}
                  value={testBody}
                  onChange={(e) => setTestBody(e.target.value)}
                  className="w-full p-2 rounded bg-surface-container-low border border-outline-variant/30 text-sm font-data-mono text-on-surface focus:outline-none focus:border-primary"
                  required
                />
                <span className="text-[11px] text-on-surface-variant block mt-1">
                  * All test dispatches pass through the global outbound queue and respect the 10-second pacing gate.
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  className="px-3 py-1.5 rounded text-xs text-on-surface-variant hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingTest}
                  className="px-4 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">send</span>
                  <span>{sendingTest ? 'Queueing...' : 'Dispatch Test Message'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
