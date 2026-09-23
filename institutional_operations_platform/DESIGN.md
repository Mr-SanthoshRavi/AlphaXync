---
name: Institutional Operations Platform
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#006c4a'
  on-secondary: '#ffffff'
  secondary-container: '#82f5c1'
  on-secondary-container: '#00714e'
  tertiary: '#824500'
  on-tertiary: '#ffffff'
  tertiary-container: '#a65900'
  on-tertiary-container: '#ffede1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#85f8c4'
  secondary-fixed-dim: '#68dba9'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.01em
  data-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.015em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.375rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 1.75rem
---

## Brand & Style

This design system embodies high-velocity institutional financial administration, automated reconciliation, and fee management. The design style combines **Corporate / Modern Precision** with **Minimalist Utility**, drawing structural influence from data-dense engineering consoles and institutional fintech interfaces.

### Core Character
- **Institutional Authority:** Unapologetically focused on data throughput, high legibility, and predictable states.
- **Micro-Precision:** Elimination of ornamental clutter. Every pixel, separator line, and typographic weight exists to facilitate transactional verification and auditability.
- **Calm Velocity:** Mitigates operational fatigue during multi-hour financial reconciliation cycles through controlled contrast, muted backgrounds, and zero decorative motion.

## Colors

The palette enforces clear operational hierarchy, using restraint to highlight financial anomalies, validation statuses, and actionable state changes.

### Surface and Canvas Architecture
- **Canvas Base:** `#f8fafc` (slate-50) creates a soft, eye-resting foundation across high-density desktop views.
- **Card & Data Surfaces:** `#ffffff` (pure white) defines elevated data zones, active tables, side sheets, and modal workflows.
- **Subtle Partitioning:** `#e2e8f0` (slate-200) serves as the primary structural boundary line across all card borders, table dividers, and pinned navigation rails.

### Functional & Semantic Roles
- **Primary Accent (`#2563eb`):** Reserved strictly for primary batch executions, active navigation indicators, and keyboard-focus rings.
- **Success (`#059669`):** Indicates cleared reconciliations, settled fee vouchers, and authenticated audits.
- **Warning (`#d97706`):** Identifies pending exceptions, escrow holds, and threshold warnings.
- **Destructive (`#dc2626`):** Signals settlement failures, reconciliation variances, and ledger reversals.
- **Muted Slate (`#64748b`):** Secondary metadata, inactive states, column headers, and structural timestamp details.
- **Foreground Neutral (`#0f172a`):** Maximum-contrast slate-900 for high-density monetary figures and primary labels.

## Typography

Typography prioritizes tabular scanning and informational compactness.

### Typographic Distribution
- **Geist (Display & Section Headers):** Delivers clean geometry and tight horizontal tracking for module titles and key operational panels.
- **Inter (Interface & Table Cells):** Chosen for optical clarity at compact 12px and 13px scale, maintaining high legibility inside multi-column audit views.
- **JetBrains Mono (Ledger & Numeric Stream):** Dedicated to transaction hashes, account references, and right-aligned currency displays (`₹`), ensuring precise vertical digit alignment.

### Numeric Rules
- All numeric currency instances must employ tabular lining numbers (`font-variant-numeric: tabular-nums`).
- Currency values under the Indian numbering convention (e.g., `₹12,45,670.00`) should pair `data-mono` with right alignment within table headers and cells.

## Layout & Spacing

The layout is optimized around a fixed 1440px desktop baseline with a dual-tier navigation system: a 240px fixed utility rail and a fluid primary content pane.

### Layout Mechanics
- **Canvas Framework:** 12-column grid system constrained to high-density desktop screens, utilizing 16px gutters and 24px main canvas margins.
- **Component Tightness:** Spacing intervals favor 4px, 6px, and 12px steps to eliminate unnecessary vertical travel and maximize above-the-fold information density.
- **Header Alignment:** Sticky 48px global utility bar and 40px view-context sub-header with bottom borders matching `#e2e8f0`.
- **Slide-out Workflows:** 480px fixed-width right-side overlay drawer for line-item exception remediation, leaving contextual summary tables visible underneath.

## Elevation & Depth

This design system avoids heavy shadows, instead employing **Low-Contrast Outlines & Surface Layering** inspired by modern developer consoles.

### Elevation Architecture
- **Level 0 (App Canvas):** `#f8fafc`, static background layer.
- **Level 1 (Data Cards & Workstations):** Pure white `#ffffff` bound by a crisp `1px solid #e2e8f0` outline. Flat zero shadow.
- **Level 2 (Hover Surfaces & Flyouts):** `0 1px 2px 0 rgba(15, 23, 42, 0.05)`, used exclusively on active row highlights and dropdown context menus.
- **Level 3 (Right Sliding Drawers & Pinned Modals):** `0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03)`, coupled with an internal `1px solid #e2e8f0` structural boundary.

## Shapes

The geometric identity relies on tight, industrial contours to reinforce stability and density.

### Radius Token Matrix
- **Base Components (Inputs, Buttons, Badges):** `4px` (`roundedness: 1`), providing an exact, professional feel without harsh raw edges.
- **Containers & Tables:** `6px` outer boundary radius with square internal borders (`0px`) between tabular segments.
- **Pill Exceptions:** Rounded-full is restricted solely to compact numerical counter tags within tab controls.

## Components

### Buttons
- **Primary:** Background `#2563eb`, foreground `#ffffff`, border `1px solid #1d4ed8`. Padding `6px 12px`, text `body-md` (500 weight). Hover: `#1d4ed8`. Focus: `box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #2563eb`.
- **Secondary / Outline:** Background `#ffffff`, foreground `#0f172a`, border `1px solid #e2e8f0`. Hover: `#f8fafc`.
- **Destructive Subtle:** Background `#fef2f2`, foreground `#dc2626`, border `1px solid #fecaca`. Hover: `#fee2e2`.

### Inputs & Filters
- **Form Inputs:** Fixed height `32px`. Text `body-md`, padding `4px 8px`. Border `1px solid #cbd5e1`, background `#ffffff`. Active state: Border `#2563eb`, ring `1px solid #2563eb`.
- **Inline Filter Chips:** Height `26px`. Border `1px solid #e2e8f0`, background `#f8fafc`. Label `label-sm` with trailing dismiss button.

### Tables & Tabular Rows
- **Header Cells:** Height `32px`, uppercase `label-sm`, tracking `0.02em`, foreground `#64748b`, background `#f8fafc`, border-bottom `1px solid #e2e8f0`.
- **Body Rows:** Height `36px` (compact density) or `44px` (with secondary metadata). Border-bottom `1px solid #f1f5f9`. Hover state: `#f8fafc`.
- **Currency Columns:** Strict right-alignment. Typography `data-mono` (`#0f172a`), explicit prefix `₹` styled at `#64748b` to distinguish symbol from data.

### Status Badges
- **Success:** Background `#ecfdf5`, text `#065f46`, border `1px solid #a7f3d0`.
- **Warning:** Background `#fffbeb`, text `#92400e`, border `1px solid #fde68a`.
- **Critical / Failed:** Background `#fef2f2`, text `#991b1b`, border `1px solid #fecaca`.
- **Neutral / Draft:** Background `#f1f5f9`, text `#475569`, border `1px solid #e2e8f0`.
- Dimensioning: 20px fixed height, 6px horizontal padding, font `label-sm` (600 weight).

### Tab Navigation
- Horizontal segmented list. 32px height. Underline layout using a 2px active bar tinted `#2563eb` with 0px offset. Inactive tabs styled with `#64748b` hover to `#0f172a`.

### Slide-out Drawer
- Pinned to right edge, `width: 480px`, `height: 100vh`. Sticky header containing title, status badge, and dismiss icon. Scrollable body with `space-lg` padding separating ledger breakdown blocks. Bottom action bar pinned with confirmation trigger and audit log link.