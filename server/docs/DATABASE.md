# CampusFlow Operations Platform: Database Architecture & Schema Reference

CampusFlow uses MongoDB via Mongoose as an operational data store and protected financial ledger. The database is organized around strict integrity rules to prevent data loss or unauthorized modifications during spreadsheet synchronizations.

---

## 1. Core Data Architecture & Ownership Model

CampusFlow enforces a strict two-tier data ownership hierarchy:

```
┌─────────────────────────────────────────┐       ┌─────────────────────────────────────────┐
│     EXTERNAL SOURCE (Google/Excel)      │       │     PROTECTED LEDGER (CampusFlow)       │
│                                         │       │                                         │
│ • Student Name, Roll No, Register No    │  ───▶ │ • Authoritative Balance Calculation     │
│ • Course, Section, Quota, Category      │       │ • Verified Razorpay Payments            │
│ • Parent Name, Primary WhatsApp Phone   │       │ • Counter Cash/Bank DD Payments         │
│ • Base Tuition Fee Quote (Initial)      │       │ • Sequential Receipt Records            │
└─────────────────────────────────────────┘       └─────────────────────────────────────────┘
                                                                   │
                                                Discrepancy Trigger│ (If spreadsheet edits
                                                                   ▼  protected payment columns)
                                                  ┌─────────────────────────────────┐
                                                  │       SyncConflict Record       │
                                                  │  (Requires Admin Resolution)    │
                                                  └─────────────────────────────────┘
```

1. **Source-Owned Fields**: Identity, contact numbers, department, quota, and initial fee structures are owned by the institutional spreadsheet. Changes in the sheet sync automatically into the `Student` record.
2. **Ledger-Owned Fields**: `paidAmount`, `paymentStatus`, `Payment` transaction history, and `Receipt` vouchers are owned **exclusively** by the application. Spreadsheet attempts to edit payment amounts create a `SyncConflict` and never overwrite verified transactions.

---

## 2. Collections & Schema Definitions

### 2.1 `institutions`
Stores institutional profile, timezone, contact info, and receipt counter configurations.
- `_id`: `ObjectId`
- `name`: `String` (e.g., `"St. Xavier's Engineering College"`)
- `code`: `String` (Unique uppercase identifier e.g., `"STXAVIER"`)
- `academicYear`: `String` (Active year e.g., `"2024-25"`)
- `currency`: `String` (Default: `"INR"`)
- `timezone`: `String` (Default: `"Asia/Kolkata"`)
- `settings`: `Object` (Notification windows, receipt prefix, fine grace periods)

### 2.2 `users`
System operators: Administrators and Cashiers.
- `_id`: `ObjectId`
- `institutionId`: `ObjectId` -> `institutions._id`
- `name`: `String`
- `email`: `String` (Unique, lowercase)
- `passwordHash`: `String` (bcrypt salt round 12)
- `role`: `String` (`"ADMIN" | "CASHIER"`)
- `isActive`: `Boolean`
- `failedLoginAttempts`: `Number`
- `lockUntil`: `Date`

### 2.3 `data_connections`
Maintains external spreadsheet connectivity metadata.
- `_id`: `ObjectId`
- `institutionId`: `ObjectId`
- `type`: `String` (`"GOOGLE_SHEETS" | "EXCEL_ONLINE" | "XLSX_FILE"`)
- `name`: `String`
- `config`: `Object` (Encrypted OAuth tokens, sheet ID, worksheet title)
- `columnMapping`: `Map<String, String>` (Maps source sheet headers to canonical fields)
- `lastSyncAt`: `Date`
- `status`: `String` (`"CONNECTED" | "ERROR" | "SYNCING"`)

### 2.4 `students`
Normalized student directory with source-diffing state.
- `_id`: `ObjectId`
- `institutionId`: `ObjectId`
- `externalStudentId`: `String` (Institutional Roll / Reg No)
- `academicYear`: `String` (e.g., `"2024-25"`)
- `fullName`: `String`
- `fatherName`: `String`
- `course`: `String` (e.g., `"B.Tech Computer Science"`)
- `yearOfStudy`: `Number` (1, 2, 3, 4)
- `whatsappNumber`: `String` (E.164 normalized format e.g., `"+919876543210"`)
- `email`: `String`
- `recordState`: `String` (`"VALID" | "WARNING" | "CONFLICT" | "SOURCE_MISSING"`)
- `sourceHash`: `String` (SHA-256 hash of mapped raw source data for instant change detection)
- `rawSourceData`: `Object` (Verbatim snapshot of row data from sheet)
- **Indexes**:
  - `{ institutionId: 1, academicYear: 1, externalStudentId: 1 }` (Unique compound index)
  - `{ institutionId: 1, whatsappNumber: 1 }`
  - `{ institutionId: 1, recordState: 1 }`

### 2.5 `fee_accounts`
Authoritative financial account per student per academic cycle.
- `_id`: `ObjectId`
- `institutionId`: `ObjectId`
- `studentId`: `ObjectId` -> `students._id` (Unique per student per year)
- `academicYear`: `String`
- `annualFee`: `Number` (Base fee quoted in sheet)
- `adjustedFee`: `Number` (Institutional concession or revised fee)
- `fineAmount`: `Number` (Calculated fine based on due date)
- `paidAmount`: `Number` (Derived exclusively from verified `payments`)
- `balance`: `Number` (`(adjustedFee + fineAmount) - paidAmount`)
- `paymentStatus`: `String` (`"CLEARED" | "PARTIAL" | "PENDING" | "OVERDUE"`)
- `dueDate`: `Date`
- `notes`: `String`
- **Indexes**:
  - `{ institutionId: 1, studentId: 1 }` (Unique)
  - `{ institutionId: 1, paymentStatus: 1 }`

### 2.6 `payments`
Immutable financial transaction ledger. Normal fields are append-only.
- `_id`: `ObjectId`
- `institutionId`: `ObjectId`
- `studentId`: `ObjectId` -> `students._id`
- `feeAccountId`: `ObjectId` -> `fee_accounts._id`
- `amount`: `Number`
- `method`: `String` (`"RAZORPAY" | "CASH" | "BANK_TRANSFER" | "CHEQUE" | "DD" | "UPI_OFFLINE"`)
- `status`: `String` (`"CREATED" | "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED"`)
- `transactionId`: `String` (Unique bank/Razorpay reference)
- `receiptNumber`: `String` (Sequential e.g., `"REC-2024-000142"`)
- `capturedAt`: `Date`
- `recordedBy`: `ObjectId` -> `users._id` (Null for self-service online checkout)
- `notes`: `String`
- **Indexes**:
  - `{ institutionId: 1, transactionId: 1 }` (Sparse unique index)
  - `{ institutionId: 1, receiptNumber: 1 }` (Unique)
  - `{ studentId: 1, status: 1 }`

### 2.7 `payment_intents`
Ephemeral checkout sessions for public student pay links (`/pay/:token`).
- `_id`: `ObjectId`
- `token`: `String` (Cryptographically generated UUID v4, unique)
- `institutionId`: `ObjectId`
- `studentId`: `ObjectId`
- `amount`: `Number`
- `razorpayOrderId`: `String`
- `status`: `String` (`"PENDING" | "COMPLETED" | "EXPIRED"`)
- `expiresAt`: `Date` (TTL index for automatic MongoDB expiration)

### 2.8 `jobs`
MongoDB-backed atomic background queue with zero external infrastructure dependencies.
- `_id`: `ObjectId`
- `type`: `String` (`"AUTOMATION_EVALUATE" | "MESSAGE_DISPATCH" | "SHEET_WRITE_BACK" | "SYNC_RUN"`)
- `status`: `String` (`"QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED"`)
- `payload`: `Object`
- `runAt`: `Date` (Execution scheduled time)
- `attempts`: `Number`
- `maxAttempts`: `Number` (Default: 5)
- `lockedAt`: `Date`
- `lockedBy`: `String` (Worker process ID)
- `lastError`: `String`
- **Atomic Claim Pattern**:
  ```typescript
  const job = await Job.findOneAndUpdate(
    {
      status: 'QUEUED',
      runAt: { $lte: new Date() },
      $or: [
        { lockedAt: null },
        { lockedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } } // Crash recovery (5 min)
      ]
    },
    {
      $set: {
        status: 'PROCESSING',
        lockedAt: new Date(),
        lockedBy: processId
      },
      $inc: { attempts: 1 }
    },
    { new: true }
  );
  ```

### 2.9 `messages`
WhatsApp communication logs with strict idempotency protection.
- `_id`: `ObjectId`
- `institutionId`: `ObjectId`
- `studentId`: `ObjectId`
- `recipientPhone`: `String` (E.164)
- `templateName`: `String`
- `templateParams`: `Object`
- `status`: `String` (`"QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED"`)
- `idempotencyKey`: `String` (Unique constraint prevents duplicate sends)
- `providerMessageId`: `String` (`wamid.HBg...`)
- `deliveredAt`: `Date`
- `readAt`: `Date`
- **Indexes**:
  - `{ idempotencyKey: 1 }` (Unique index)
  - `{ institutionId: 1, recipientPhone: 1 }`

### 2.10 `sync_conflicts`
Records differences when source sheet values contradict protected payment values.
- `_id`: `ObjectId`
- `institutionId`: `ObjectId`
- `studentId`: `ObjectId`
- `field`: `String` (`"paidAmount" | "paymentStatus" | "annualFee"`)
- `sourceValue`: `Mixed`
- `appValue`: `Mixed`
- `status`: `String` (`"OPEN" | "RESOLVED" | "IGNORED"`)
- `resolvedBy`: `ObjectId` -> `users._id`
- `resolvedAt`: `Date`

### 2.11 `audit_logs`
Immutable compliance and forensic logging.
- `_id`: `ObjectId`
- `institutionId`: `ObjectId`
- `actorId`: `ObjectId` -> `users._id`
- `action`: `String` (e.g., `"OFFLINE_PAYMENT_RECORDED"`, `"FEE_ADJUSTED"`, `"CONFLICT_RESOLVED"`)
- `resourceType`: `String`
- `resourceId`: `String`
- `before`: `Object`
- `after`: `Object`
- `ipAddress`: `String`
- `timestamp`: `Date`
