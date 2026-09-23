# CampusFlow Operations Platform: API Reference Manual

This document details every REST endpoint, query parameter, request payload, response schema, error handling format, Server-Sent Events (SSE) stream, and external webhook handler implemented in the CampusFlow backend.

---

## 1. Global Standards & Conventions

### Base URL
- Local Development: `http://localhost:5000/api`
- Production: `https://<institution-domain>/api`

### Security Headers & Content Types
- All API requests and responses use `Content-Type: application/json` unless specified otherwise.
- CORS is configured to accept credentials (`credentials: 'include'`).
- CSRF protection and authentication are enforced via `httpOnly` secure cookies (`token`) or `Authorization: Bearer <token>` headers.

### Standard Response Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 50,
    "totalPages": 2
  }
}
```

### Standard Error Response Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT | RATE_LIMITED | INTERNAL_SERVER_ERROR",
    "message": "Human-readable explanation of error",
    "details": [ ... ]
  }
}
```

---

## 2. Authentication & Session Endpoints (`/api/auth`)

### 2.1 Initial Setup (First Time Bootstrap)
Creates the primary institutional admin account and seeds default institution records.
- **Method**: `POST`
- **Path**: `/api/auth/setup`
- **Access**: Public (only works if zero users exist in the database)
- **Request Body**:
  ```json
  {
    "name": "Prof. R. Sundaram",
    "email": "admin@stxaviers.edu",
    "password": "StrongPassword#2026",
    "institutionName": "St. Xavier's Engineering College",
    "institutionCode": "STXAVIER"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "_id": "60d0fe4f5311236168a109ca",
        "name": "Prof. R. Sundaram",
        "email": "admin@stxaviers.edu",
        "role": "ADMIN",
        "institutionId": "60d0fe4f5311236168a109cb"
      }
    }
  }
  ```

### 2.2 User Login
Authenticates an administrator or cashier, setting an `httpOnly` cookie and returning a session token.
- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Access**: Public (Rate-limited: 5 attempts/min)
- **Request Body**:
  ```json
  {
    "email": "admin@stxaviers.edu",
    "password": "StrongPassword#2026"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "_id": "60d0fe4f5311236168a109ca",
        "name": "Prof. R. Sundaram",
        "email": "admin@stxaviers.edu",
        "role": "ADMIN"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

### 2.3 Get Current Profile
- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Access**: Authenticated (`ADMIN` or `CASHIER`)
- **Response (200 OK)**: Current user profile and permissions.

### 2.4 Logout
Clears the `httpOnly` cookie and invalidates the session token.
- **Method**: `POST`
- **Path**: `/api/auth/logout`
- **Access**: Authenticated

---

## 3. Dashboard Endpoints (`/api/dashboard`)

### 3.1 Get Dashboard Metric Summary
Returns the high-precision top 4 operational stat cards, fee velocity distribution, and active attention triggers.
- **Method**: `GET`
- **Path**: `/api/dashboard/summary`
- **Access**: Authenticated (`ADMIN` or `CASHIER`)
- **Query Params**:
  - `academicYear` (optional, default: current active academic year e.g. `2024-25`)
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "stats": {
        "totalStudents": 4280,
        "newEntriesCount": 42,
        "pendingFeesAmount": 3480000,
        "outstandingStudentsCount": 312,
        "collectedTodayAmount": 485000,
        "receiptsIssuedToday": 38,
        "messagesSentToday": 482,
        "messageDeliveryRate": 98.6
      },
      "feeDistribution": {
        "projectedTarget": 12400000,
        "collectedAmount": 8920000,
        "collectedPercentage": 71.9,
        "pendingAmount": 2650000,
        "pendingPercentage": 21.4,
        "overdueAmount": 830000,
        "overduePercentage": 6.7
      },
      "attentionItems": [
        {
          "type": "MISSING_PHONE",
          "severity": "WARNING",
          "count": 5,
          "description": "5 students missing WhatsApp numbers"
        },
        {
          "type": "SYNC_CONFLICT",
          "severity": "CRITICAL",
          "count": 1,
          "description": "1 payment conflict detected in sheet sync"
        }
      ]
    }
  }
  ```

### 3.2 Real-time Server-Sent Events (SSE) Stream
Maintains an open HTTP connection streaming ledger updates, receipt generations, sync progress, and WhatsApp deliveries to desktop clients.
- **Method**: `GET`
- **Path**: `/api/dashboard/live-stream`
- **Access**: Authenticated (`ADMIN` or `CASHIER`)
- **Response Protocol**: `text/event-stream`
- **Event Names**:
  - `PAYMENT_CAPTURED`: Emitted when online or offline payment is finalized.
  - `SYNC_PROGRESS`: Emitted during external sheet ingestion.
  - `MESSAGE_STATUS`: Emitted on WhatsApp delivery updates.

---

## 4. Student Management Endpoints (`/api/students`)

### 4.1 Master Student Directory Table
Returns paginated, searchable, and filtered student records.
- **Method**: `GET`
- **Path**: `/api/students`
- **Access**: Authenticated (`ADMIN` or `CASHIER`)
- **Query Params**:
  - `search`: Full-text search across `fullName`, `externalStudentId`, `enrollmentNumber`, and `whatsappNumber`.
  - `course`: Filter by department/course (e.g. `B.Tech CSE`).
  - `year`: Filter by academic year (e.g. `2024-25`).
  - `paymentStatus`: Filter by `CLEARED | PARTIAL | PENDING | OVERDUE`.
  - `recordState`: Filter by `VALID | WARNING | CONFLICT | SOURCE_MISSING`.
  - `page`: Page index (default: `1`).
  - `limit`: Items per page (default: `25`, max: `100`).

### 4.2 Student Detail & 480px Slide-out Drawer Payload
Returns 360° student data including academic details, protected fee balance, payment ledger history, communications log, and conflict flags.
- **Method**: `GET`
- **Path**: `/api/students/:id`
- **Access**: Authenticated (`ADMIN` or `CASHIER`)
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "student": {
        "_id": "60d0fe4f5311236168a109cd",
        "externalStudentId": "STU-2024-001",
        "fullName": "Arun Kumar",
        "course": "B.Tech Computer Science",
        "academicYear": "2024-25",
        "whatsappNumber": "+919876543210",
        "email": "arun.k@college.edu",
        "recordState": "VALID"
      },
      "feeAccount": {
        "annualFee": 75000,
        "adjustedFee": 75000,
        "paidAmount": 45000,
        "balance": 30000,
        "paymentStatus": "PARTIAL",
        "dueDate": "2026-10-15T00:00:00.000Z",
        "fineAmount": 0
      },
      "payments": [
        {
          "receiptNumber": "REC-2026-000001",
          "amount": 45000,
          "method": "RAZORPAY",
          "transactionId": "pay_O7s8xN93ka12",
          "status": "CAPTURED",
          "capturedAt": "2026-09-21T10:30:00.000Z"
        }
      ],
      "messages": [ ... ],
      "conflicts": [ ... ]
    }
  }
  ```

---

## 5. Protected Fee & Payment Ledger Endpoints (`/api/fees`, `/api/payments`)

### 5.1 Fee Accounts Ledger
- **Method**: `GET`
- **Path**: `/api/fees`
- **Access**: Authenticated (`ADMIN` or `CASHIER`)

### 5.2 Record Offline Counter Payment
Allows Cashier to log cash, bank DD, or offline UPI payment directly into the immutable ledger.
- **Method**: `POST`
- **Path**: `/api/payments/offline`
- **Access**: Authenticated (`ADMIN` or `CASHIER`)
- **Request Body**:
  ```json
  {
    "studentId": "60d0fe4f5311236168a109cd",
    "amount": 15000,
    "method": "CASH | BANK_TRANSFER | CHEQUE | DD | UPI_OFFLINE",
    "referenceNumber": "SBI-CHQ-981245",
    "notes": "Payment received at Finance Desk Counter #02"
  }
  ```
- **Guaranteed Side Effects**:
  1. Ledger `paidAmount` atomically incremented; `balance` recalculated.
  2. Sequential receipt `REC-YYYY-XXXXXX` generated.
  3. Sheet write-back job queued for background retry.
  4. WhatsApp receipt delivery queued.
  5. Pending fee reminder automations for this student cancelled.

### 5.3 Generate Payment Request Link (Razorpay)
Generates a secure, cryptographically random checkout link sent to student/parent via WhatsApp or SMS.
- **Method**: `POST`
- **Path**: `/api/payments/request`
- **Access**: Authenticated (`ADMIN` or `CASHIER`)
- **Request Body**:
  ```json
  {
    "studentId": "60d0fe4f5311236168a109cd",
    "amount": 30000,
    "description": "Term 2 Tuition Balance",
    "sendWhatsApp": true
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "paymentUrl": "http://localhost:5000/pay/7f3a9e2c-b14d-45f8-a3bc-91d84e201bfa",
      "token": "7f3a9e2c-b14d-45f8-a3bc-91d84e201bfa",
      "expiresAt": "2026-09-28T14:32:00.000Z"
    }
  }
  ```

### 5.4 Adjust Base Fee
- **Method**: `POST`
- **Path**: `/api/payments/adjust-fee`
- **Access**: Authenticated (`ADMIN` only)
- **Request Body**:
  ```json
  {
    "studentId": "60d0fe4f5311236168a109cd",
    "newFee": 70000,
    "reason": "Merit Scholarship concession (Ref: TRUST/2026/89)"
  }
  ```

### 5.5 Waive Fine
- **Method**: `POST`
- **Path**: `/api/payments/waive-fine`
- **Access**: Authenticated (`ADMIN` only)
- **Request Body**:
  ```json
  {
    "studentId": "60d0fe4f5311236168a109cd",
    "reason": "Medical leave approved by Dean of Student Affairs"
  }
  ```

---

## 6. Public Payment Checkout (`/api/public/pay/:token`)

### 6.1 Fetch Payment Intent Details
- **Method**: `GET`
- **Path**: `/api/public/pay/:token`
- **Access**: Public (Token validated, rate-limited)
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "studentName": "Arun Kumar",
      "institutionName": "St. Xavier's Engineering College",
      "amount": 30000,
      "currency": "INR",
      "razorpayOrderId": "order_mock_1789998604648_7a9",
      "razorpayKeyId": "rzp_test_mockKey123",
      "description": "Term 2 Tuition Balance",
      "status": "PENDING"
    }
  }
  ```

### 6.2 Submit Client Payment Callback (Verification Request)
Client submits Razorpay checkout payload. Status is **never** trusted directly; server cryptographically recalculates HMAC-SHA256 signature using `RAZORPAY_KEY_SECRET`.
- **Method**: `POST`
- **Path**: `/api/public/pay/:token/verify`
- **Access**: Public
- **Request Body**:
  ```json
  {
    "razorpay_payment_id": "pay_live_e2e_9988",
    "razorpay_order_id": "order_mock_1789998604648_7a9",
    "razorpay_signature": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
  ```

---

## 7. Webhook Listeners (`/api/webhooks`)

### 7.1 Razorpay Webhook
- **Method**: `POST`
- **Path**: `/api/webhooks/razorpay`
- **Access**: Razorpay Servers (Verified via `X-Razorpay-Signature` HMAC-SHA256)
- **Idempotency**: Checked against `X-Razorpay-Event-Id` and `Payment.transactionId`. Duplicate webhooks return `200 OK` immediately without duplicate ledger credits.

### 7.2 WhatsApp Cloud API Webhook
- **GET `/api/webhooks/whatsapp`**: Handles Meta Webhook Verification challenge (`hub.mode`, `hub.verify_token`, `hub.challenge`).
- **POST `/api/webhooks/whatsapp`**: Processes delivery updates (`sent`, `delivered`, `read`, `failed`) and converts incoming queries into helpdesk `Ticket` entries.

---

## 8. Sync & Data Management (`/api/sync`)

### 8.1 Trigger Manual Synchronization
- **Method**: `POST`
- **Path**: `/api/sync/trigger`
- **Access**: Authenticated (`ADMIN` only)

### 8.2 Save Column Mapping
- **Method**: `POST`
- **Path**: `/api/sync/mapping`
- **Access**: Authenticated (`ADMIN` only)

### 8.3 Resolve Sync Conflict
- **Method**: `POST`
- **Path**: `/api/sync/conflicts/:id/resolve`
- **Access**: Authenticated (`ADMIN` only)
- **Request Body**:
  ```json
  {
    "resolution": "KEEP_APP_VALUE | OVERWRITE_WITH_SOURCE | MANUAL_OVERRIDE",
    "notes": "Reviewed transaction statement with accounts team"
  }
  ```
