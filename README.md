# CampusFlow Operations Platform (Phase 1 UI/UX Blueprint)

## 📌 Project Overview
CampusFlow is a desktop-first, lightweight institution communication and fee automation platform designed for college and school operations (Cashier, Fee Management, Office Staff, Admin). It acts as an operational control center mirroring tabular data sources (Google Sheets / Excel) without forcing institutions into a full ERP.

--- 

## 📂 Current Prototype Assets & Design Files

The workspace contains exported UI/UX screen designs and design system specifications:

```text
stitch_campusflow_operations_platform/
├── institutional_operations_platform/
│   └── DESIGN.md                     # Complete Design System tokens (Colors, Typography, Spacing, Elevation, Components)
├── operations_dashboard/
│   ├── code.html                     # Prototype: Operations Console, High-Precision Metric Cards, Live Feed
│   └── screen.png                    # Screen capture of Dashboard layout
├── students_directory_drawer/
│   ├── code.html                     # Prototype: Master Student Directory & Slide-out Detail Drawer (480px)
│   └── screen.png                    # Screen capture of Student Directory & Drawer
├── fees_protected_payments/
│   ├── code.html                     # Prototype: Fees & Protected Payments Ledger, Audit Drawer, Verification UI
│   └── screen.png                    # Screen capture of Protected Payments layout
└── README.md                         # Project roadmap & architecture blueprint
```

---

## 🎨 Design System Summary (from `DESIGN.md`)

- **Design Philosophy**: Calm, clean, professional, desktop-first (1440px primary, 1280px-1920px supported), low cognitive load.
- **Typography**: 
  - Section Headers: `Geist`
  - Body & UI Cells: `Inter`
  - Currency & Hashes: `JetBrains Mono` (`font-variant-numeric: tabular-nums`, right-aligned `₹`)
- **Color System**:
  - Primary: `#004ac6` / `#2563eb`
  - Success / Settled: `#006c4a` / `#059669`
  - Warning / Pending: `#824500` / `#d97706`
  - Destructive / Error: `#ba1a1a` / `#dc2626`
  - Surfaces: `#faf8ff` / `#ffffff` / `#f2f3ff`
- **Component Geometry**: Compact radius (4px-6px), 32px inputs/filter chips, 36px-44px table row heights, 480px slide-out right drawer.

---

## 🗺️ Screen & Route Architecture Blueprint

| Route | Spec Section | Existing Stitch Asset | Key UI Elements |
| :--- | :--- | :--- | :--- |
| `/dashboard` | §7 | `operations_dashboard/` | Top 4 stat cards, Payment Overview, Automation Activity, Recent Feed, Needs Attention |
| `/students` | §8, §9 | `students_directory_drawer/` | Master table, search/filters, compact status badges, 480px right-side drawer (fees, history) |
| `/fees` | §10, §11, §12 | `fees_protected_payments/` | Protected payment table, verification badge, controlled dialogs (Offline Payment, Waive Fine, Adjust) |
| `/automations` | §13–§20 | *Ready for implementation* | 5 modules: Greetings, Fee Reminders, College Info, Complaints Inbox, Staff Reminders |
| `/messages` | §21 | *Ready for implementation* | Activity log: Sent, Delivered, Failed, Pending, Scheduled, Retry drawer |
| `/sync` | §22–§25 | *Ready for implementation* | Connection status, Column Mapping Wizard, Data Validation, Conflict Resolution UI |
| `/settings` | §26 | *Ready for implementation* | Minimalist connection states (Razorpay, WhatsApp, Sheets) without raw secret exposure |
| `/onboarding` | §27 | *Ready for implementation* | 6-step setup flow for institution config, data mapping, and automation presets |

---

## 🚀 Phase 2 Full-Stack Monolithic Architecture

Phase 2 connects the desktop-first UI/UX to a production-grade, modular monolithic backend (`Node.js` + `Express` + `TypeScript` + `MongoDB`) with an in-process atomic background queue:

```text
stitch_campusflow_operations_platform/
├── client/                           # React 19 + TypeScript + Vite + Tailwind CSS (Phase 1 UI Connected)
│   ├── src/
│   │   ├── components/shell/         # Sidebar, Header, CashierModeToggle
│   │   ├── pages/                    # Dashboard, Students, Fees, Automations, Messages, Sync, Settings, PublicPay
│   │   └── lib/api.ts                # Typed fetch API client connecting to /api/*
│   └── vite.config.ts                # Configured with proxy to http://localhost:5000
├── server/                           # Modular Monolith Backend (Express + TypeScript + Mongoose)
│   ├── src/
│   │   ├── config/                   # Zod validated env, database connection (with auto MongoMemoryServer fallback)
│   │   ├── models/                   # 14 Schema models (Student, FeeAccount, Payment, Job, Message, Conflict, etc.)
│   │   ├── integrations/             # DataSourceAdapter, GoogleSheets, Excel, Razorpay, WhatsApp Cloud API
│   │   ├── modules/                  # Auth, Dashboard, Students, Fees, Payments, Automations, Messages, Sync, Settings
│   │   ├── webhooks/                 # Razorpay HMAC signature verifier, Meta WhatsApp challenge & status listener
│   │   ├── workers/                  # Atomic MongoDB job queue, Automation timeline, Message dispatch, Sheet write-back
│   │   └── tests/                    # 7 Vitest test suites (57/57 tests passing)
│   └── docs/                         # Comprehensive Engineering Documentation
│       ├── API_REFERENCE.md          # REST API endpoints, schemas, SSE streams, webhooks
│       ├── ENV_SETUP.md              # Local quickstart & environment variables reference
│       ├── DATABASE.md               # MongoDB collections, indexes, and concurrency locking
│       ├── INTEGRATIONS.md           # Google Cloud, Microsoft Graph, Razorpay, and WhatsApp setup guides
│       └── DEPLOYMENT.md             # Production deployment for Render/Koyeb and Ubuntu VPS
```

---

## 🧪 Automated Test Suite (100% Pass Rate)

Run the full end-to-end and sub-phase integration test suite:

```powershell
cd server
npm test
```

- `src/tests/phase2a.test.ts` (10 tests): Backend Foundation, Models, Auth & RBAC
- `src/tests/phase2b.test.ts` (6 tests): Student Data Layer, Adapters & Sync Engine
- `src/tests/phase2c.test.ts` (11 tests): REST Controllers, Fee Auditing & Live State
- `src/tests/phase2d.test.ts` (8 tests): Atomic Job Queue, Exponential Backoff & Automations
- `src/tests/phase2e.test.ts` (6 tests): WhatsApp Meta Cloud API, Templates & Webhook Verification
- `src/tests/phase2f_2g.test.ts` (7 tests): Razorpay HMAC Verifier, Protected Ledger & Controlled Sheet Write-Back
- `src/tests/e2e_acceptance.test.ts` (9 tests): Complete End-to-End Operational Lifecycle Workflow
- **Total: 57 / 57 Tests Passing**

---

## 🏃 Running the Application Locally

### 1. Start the Backend API (Port 5000)
```powershell
cd server
npm run dev
```

### 2. Start the Frontend Client (Port 5173)
```powershell
cd client
npm run dev
```
Open `http://localhost:5173` in your browser.

