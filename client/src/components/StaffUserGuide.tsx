import React, { useState } from 'react';

interface GuideModule {
  id: string;
  title: string;
  category: 'GENERAL' | 'ROLES' | 'MODULES' | 'DATA' | 'LIMITS' | 'WARNINGS' | 'PRODUCTION';
  icon: string;
  summary: string;
  content: React.ReactNode;
}

export const StaffUserGuide: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    overview: true,
    roles: true,
    fees: true,
    warnings: true
  });

  const toggleModule = (id: string) => {
    setExpandedModules((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    setExpandedModules({
      overview: true,
      roles: true,
      modules: true,
      fees: true,
      automations: true,
      data: true,
      limits: true,
      warnings: true,
      production: true
    });
  };

  const collapseAll = () => {
    setExpandedModules({});
  };

  const modules: GuideModule[] = [
    {
      id: 'overview',
      title: '1. Platform Purpose & General Architecture',
      category: 'GENERAL',
      icon: 'account_balance',
      summary: 'High-level overview of AlphaXync, its hybrid architecture, and operational goals.',
      content: (
        <div className="space-y-3 text-sm text-on-surface-variant leading-relaxed">
          <p>
            <strong>AlphaXync Operations Platform</strong> is a hybrid, enterprise-grade institution management system designed for colleges, schools, academies, and multi-branch training centers.
          </p>
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-on-surface font-sans text-xs">
            <strong className="text-primary block font-bold mb-1">💡 Core Operating Concept: Hybrid Dual-Data Engine</strong>
            AlphaXync pairs <strong>Google Sheets</strong> (for easy bulk student data entry &amp; staff collaboration) with <strong>MongoDB Enterprise Ledger</strong> (for high-speed transactional accounting, OTP auth, payment receipts, and tamper-evident audit trails).
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
            <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <strong className="text-on-surface block font-bold mb-1">🌐 Google Sheets Layer</strong>
              <ul className="list-disc list-inside space-y-1 text-on-surface-variant">
                <li>Non-technical staff can edit student master data in Google Sheets.</li>
                <li>Supports custom tags (Hostel, Quota, Bus Route, Department).</li>
                <li>Auto-synced into AlphaXync with duplicate &amp; error validation.</li>
              </ul>
            </div>

            <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <strong className="text-on-surface block font-bold mb-1">⚡ MongoDB Transactional Ledger</strong>
              <ul className="list-disc list-inside space-y-1 text-on-surface-variant">
                <li>Stores server-protected financial ledger &amp; fee balances.</li>
                <li>Generates official PDF/Print receipts with QR codes &amp; watermarks.</li>
                <li>Logs every single staff action into an immutable Audit Log.</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'roles',
      title: '2. User Roles & Access Hierarchy',
      category: 'ROLES',
      icon: 'admin_panel_settings',
      summary: 'Role isolation, staff provisioning, 1st-time OTP verification, and shift window hours.',
      content: (
        <div className="space-y-3 text-sm text-on-surface-variant leading-relaxed">
          <p>
            To prevent fraud and maintain strict accounting accountability, AlphaXync enforces 3 distinct roles:
          </p>
          <div className="space-y-2 text-xs">
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
              <strong className="text-purple-800 dark:text-purple-300 font-bold block mb-1">👑 ADMIN (System Administrator)</strong>
              <p className="text-on-surface-variant">
                Unrestricted 24/7 access. Can provision staff accounts, configure cashier shift hours, adjust fee structures, waive fines, inspect full GitHub-style audit trails, and manage integrations.
              </p>
            </div>

            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <strong className="text-emerald-800 dark:text-emerald-300 font-bold block mb-1">💰 CASHIER (Counter Payment Operator)</strong>
              <p className="text-on-surface-variant">
                Dedicated to fee counter operations. Can record cash/UPI payments, issue official receipts, and query student balances. <strong>Bound by Shift Window hours</strong> (e.g. 09:00 AM - 06:00 PM). Outside shift hours, operations are locked.
              </p>
            </div>

            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <strong className="text-blue-800 dark:text-blue-300 font-bold block mb-1">👤 STAFF (Operator / Helpdesk)</strong>
              <p className="text-on-surface-variant">
                Access to Student Directory, student inquiries, automated communications, and helpdesk support. Bound by active account status &amp; assigned shift timings.
              </p>
            </div>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-900 dark:text-amber-300 space-y-1">
            <strong className="font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">verified_user</span>
              <span>1st-Time Security OTP Verification &amp; Shift Restrictions</span>
            </strong>
            <p>
              1. When a new staff member is created, Resend dispatches a welcome invitation email.
              <br />
              2. On 1st login, staff must enter a 6-digit email OTP. Once verified, subsequent logins use password only.
              <br />
              3. If admin configures a <strong>Shift Window</strong> (e.g. 09:00 AM to 06:00 PM), staff attempts outside this window are automatically rejected.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'fees',
      title: '3. Fees & Protected Ledger Management',
      category: 'MODULES',
      icon: 'point_of_sale',
      summary: 'How to record counter payments, issue receipts, adjust fees, and waive late penalties.',
      content: (
        <div className="space-y-3 text-sm text-on-surface-variant leading-relaxed">
          <p>
            The Fees module is the financial heart of AlphaXync. All operations are double-entry verified and recorded in the Audit Log.
          </p>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <strong className="text-on-surface font-bold block mb-1">💵 1. Recording Offline Payments (Cash / Cheque / Bank Transfer / UPI)</strong>
              <ol className="list-decimal list-inside space-y-1 text-on-surface-variant">
                <li>Navigate to <strong>Fees &amp; Protected Ledger</strong> page.</li>
                <li>Click <strong>🟢 Record Payment</strong> button.</li>
                <li>Search student by Register No or Name. Select payment method &amp; amount.</li>
                <li>Click Submit. The system updates the fee balance and generates a unique receipt number (e.g. <code>REC-2026-1005</code>).</li>
                <li>Click <strong>Print Receipt</strong> to issue official receipt with institution logo &amp; watermark.</li>
              </ol>
            </div>

            <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <strong className="text-on-surface font-bold block mb-1">⚙️ 2. Adjusting Fee Totals &amp; Waiving Fines (Admin / Authorized Staff)</strong>
              <ul className="list-disc list-inside space-y-1 text-on-surface-variant">
                <li><strong>Adjust Fee</strong>: Used for scholarships or fee corrections. Updates prescribed total amount and logs author &amp; reason.</li>
                <li><strong>Waive Fine</strong>: Nullifies accrued late payment penalties to zero upon entering a valid reason.</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'automations',
      title: '4. Universal Automation Engine & WhatsApp Messaging',
      category: 'MODULES',
      icon: 'auto_mode',
      summary: 'Configuring welcome greetings, pre-due reminders, flyer image attachments, and 10s anti-spam pacing.',
      content: (
        <div className="space-y-3 text-sm text-on-surface-variant leading-relaxed">
          <p>
            AlphaXync includes a multi-channel WhatsApp &amp; SMS automation workflow engine.
          </p>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <strong className="text-on-surface font-bold block mb-1">🎯 1-Tap Quick Presets</strong>
              <ul className="list-disc list-inside space-y-1 text-on-surface-variant">
                <li><strong>Welcome Greeting</strong>: Dispatched automatically when a student is synced.</li>
                <li><strong>Pre-Payment Due Reminder</strong>: Triggered X days before due date (e.g. -2 Days).</li>
                <li><strong>Receipt Confirmation</strong>: Triggered instantly after counter payment is recorded.</li>
                <li><strong>Overdue Chaser</strong>: Repeats every 2 days for unpaid balances.</li>
              </ul>
            </div>

            <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <strong className="text-on-surface font-bold block mb-1">🖼️ Flyer / Invitation Image Attachments</strong>
              <p className="text-on-surface-variant mb-1">
                You can attach custom promotional flyers or event invitation cards to any automation campaign:
              </p>
              <ul className="list-disc list-inside space-y-1 text-on-surface-variant">
                <li><code>📁 File Upload</code>: Upload local PNG/JPG/WEBP from your computer (auto-saved to server uploads).</li>
                <li><code>🔗 Direct Image Link</code>: Paste a hosted image URL.</li>
              </ul>
            </div>

            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-900 dark:text-emerald-300">
              <strong className="font-bold block mb-1">🛡️ Anti-Spam Pacing (10-Second Delay)</strong>
              To protect the institution's WhatsApp account from ban triggers, messages are queued and dispatched with a mandatory <strong>10-second delay between recipients</strong>.
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'data',
      title: '5. Data Strategy: Google Sheets vs MongoDB Database',
      category: 'DATA',
      icon: 'sync_alt',
      summary: 'Understanding the differences, synchronization triggers, and data safety rules.',
      content: (
        <div className="space-y-3 text-sm text-on-surface-variant leading-relaxed">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse border border-outline-variant/30">
              <thead>
                <tr className="bg-surface-container-low text-on-surface font-bold border-b border-outline-variant/30">
                  <th className="p-2.5">Feature</th>
                  <th className="p-2.5">Google Sheets</th>
                  <th className="p-2.5">MongoDB Database</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                <tr>
                  <td className="p-2.5 font-bold text-on-surface">Primary Purpose</td>
                  <td className="p-2.5">Bulk student data entry &amp; column tag management.</td>
                  <td className="p-2.5">Transactional ledger, payments, OTPs, audit trail.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold text-on-surface">Who Edits?</td>
                  <td className="p-2.5">Admin &amp; Staff (via Google Sheets web UI).</td>
                  <td className="p-2.5">System API &amp; Authenticated AlphaXync app.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold text-on-surface">Data Integrity</td>
                  <td className="p-2.5">Human readable, flexible columns.</td>
                  <td className="p-2.5">Strict schema validation &amp; audit logging.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-bold text-on-surface">Conflict Resolution</td>
                  <td className="p-2.5">Sync engine detects register no changes.</td>
                  <td className="p-2.5">MongoDB is the master source for financial balances.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )
    },
    {
      id: 'limits',
      title: '6. System Boundaries & What CANNOT Be Done',
      category: 'LIMITS',
      icon: 'block',
      summary: 'Hard limits, security rules, and non-permissible actions.',
      content: (
        <div className="space-y-2 text-xs text-on-surface-variant">
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-900 dark:text-red-300 space-y-1.5">
            <strong className="font-bold block text-sm">❌ Non-Permissible Actions &amp; Hard Boundaries:</strong>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Cannot bypass shift window hours</strong>: Non-Admin staff cannot log in or record payments outside assigned hours.</li>
              <li><strong>Cannot delete Audit Log history</strong>: Audit log entries are immutable security records.</li>
              <li><strong>Cannot send instant mass WhatsApp blasts without delay</strong>: 10s pacing is enforced by server to prevent WhatsApp bans.</li>
              <li><strong>Cannot delete the sole Administrator account</strong>: System requires at least 1 active Admin.</li>
              <li><strong>Cannot record payment without choosing a payment method</strong>: All receipts require method &amp; optional reference.</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'warnings',
      title: '7. Critical Parts Needing Extreme Care ("Handle with Care")',
      category: 'WARNINGS',
      icon: 'warning',
      summary: 'High-risk controls, WhatsApp web sessions, fee overrides, and admin settings.',
      content: (
        <div className="space-y-2 text-xs">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-900 dark:text-amber-300 space-y-1.5">
            <strong className="font-bold block text-sm flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]">warning</span>
              <span>Areas Needing High Attention:</span>
            </strong>
            <ul className="list-disc list-inside space-y-1.5">
              <li>
                <strong>WhatsApp Web Pairing</strong>: Avoid clicking "Disconnect" unless changing phone numbers. Unlinking pauses automated messaging.
              </li>
              <li>
                <strong>Fee Structure Adjustments &amp; Fine Waivers</strong>: Modifying fee accounts alters actual outstanding balances. Always provide a clear, accurate reason for audit inspection.
              </li>
              <li>
                <strong>Resend Email API Credentials</strong>: Ensure verified domain credentials in <code>.env</code> remain active so OTP verification emails deliver reliably.
              </li>
              <li>
                <strong>Shift Timing Updates</strong>: When modifying staff shift hours, make sure they align with actual counter shift hours to prevent accidental lockouts.
              </li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'production',
      title: '8. Production Deployment & Operational Field Guide',
      category: 'PRODUCTION',
      icon: 'rocket_launch',
      summary: 'Best practices for live college counter deployment, thermal printers, and data backups.',
      content: (
        <div className="space-y-3 text-sm text-on-surface-variant leading-relaxed">
          <div className="space-y-2 text-xs">
            <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <strong className="text-on-surface font-bold block mb-1">🖥️ Counter Setup &amp; Thermal Printing</strong>
              <p className="text-on-surface-variant mb-1">
                For fee counter desks, set standard receipt printing preferences in browser to:
              </p>
              <ul className="list-disc list-inside space-y-1 text-on-surface-variant">
                <li>Paper Size: A4 or 80mm Thermal Receipt roll.</li>
                <li>Margins: Minimal / Default. Background Graphics: Enabled (to render seal watermarks).</li>
              </ul>
            </div>

            <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <strong className="text-on-surface font-bold block mb-1">💾 Backups &amp; Security Maintenance</strong>
              <ul className="list-disc list-inside space-y-1 text-on-surface-variant">
                <li>Perform periodic backups of MongoDB database (using <code>mongodump</code>).</li>
                <li>Keep Google Sheet master shared only with authorized institution email addresses.</li>
                <li>Monitor <strong>Audit &amp; Activity Trail</strong> regularly for unusual staff access or fee waivers.</li>
              </ul>
            </div>
          </div>
        </div>
      )
    }
  ];

  const filteredModules = modules.filter((m) => {
    const matchesCategory = selectedCategory === 'ALL' || m.category === selectedCategory;
    const matchesSearch =
      !searchTerm.trim() ||
      m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.summary.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[28px]">menu_book</span>
            <h2 className="text-xl font-bold text-on-surface">AlphaXync Staff Operating &amp; Field Guide</h2>
            <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-mono font-bold">
              BETA v2.4
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-mono font-bold">
              OFFICIAL MANUAL
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-1 max-w-3xl">
            Comprehensive operational reference for staff and admins. Covers day-to-day workflow, counter payments, shift controls, automation setup, system limits, and critical security warnings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="h-8 px-3 rounded-lg border border-outline-variant/30 text-xs font-semibold text-on-surface hover:bg-surface-container cursor-pointer"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="h-8 px-3 rounded-lg border border-outline-variant/30 text-xs font-semibold text-on-surface hover:bg-surface-container cursor-pointer"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Search & Topic Quick Jump Toolbar */}
      <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-sm flex items-center justify-between flex-wrap gap-3">
        {/* Search Input */}
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">search</span>
          <input
            type="text"
            placeholder="Search guide topics (e.g. shift hours, receipt, fine waiver, gsheet)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 bg-transparent border-none text-sm text-on-surface placeholder:text-outline focus:outline-none"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="text-xs text-on-surface-variant hover:text-on-surface cursor-pointer">
              ✕
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'ALL', label: 'All Topics' },
            { id: 'GENERAL', label: 'General' },
            { id: 'ROLES', label: 'Roles & Shift' },
            { id: 'MODULES', label: 'Fees & Receipt' },
            { id: 'DATA', label: 'Sheets vs Mongo' },
            { id: 'LIMITS', label: 'Limits' },
            { id: 'WARNINGS', label: '⚠️ Care Needed' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Guide Modules List */}
      <div className="space-y-4">
        {filteredModules.length === 0 ? (
          <div className="bg-surface-container-lowest p-12 text-center rounded-2xl border border-outline-variant/30 text-on-surface-variant">
            <span className="material-symbols-outlined text-[36px] text-outline block mb-2">menu_book</span>
            <p className="font-bold text-on-surface">No guide topics match "{searchTerm}"</p>
            <p className="text-xs text-on-surface-variant mt-1">Try clearing your search term or select "All Topics".</p>
          </div>
        ) : (
          filteredModules.map((mod) => {
            const isOpen = !!expandedModules[mod.id];

            return (
              <div
                key={mod.id}
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden shadow-2xs transition-all"
              >
                {/* Module Header */}
                <button
                  onClick={() => toggleModule(mod.id)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[22px]">{mod.icon}</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-on-surface flex items-center gap-2">
                        <span>{mod.title}</span>
                      </h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">{mod.summary}</p>
                    </div>
                  </div>

                  <span className="material-symbols-outlined text-on-surface-variant text-[20px] shrink-0 ml-2">
                    {isOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {/* Module Expanded Content */}
                {isOpen && (
                  <div className="p-5 border-t border-outline-variant/20 bg-surface-container-lowest animate-fade-in">
                    {mod.content}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
