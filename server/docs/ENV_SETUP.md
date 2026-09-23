# CampusFlow Operations Platform: Environment Setup & Configuration

This guide provides setup instructions for local development, automated testing, and production deployment.

---

## 1. Quick Start (Windows Local Development)

CampusFlow backend is built with zero-barrier local development in mind. If you do not have MongoDB running locally, the system automatically falls back to an embedded in-memory database (`mongodb-memory-server`), and mock providers for Razorpay, WhatsApp, and Google Sheets are enabled by default.

### Step 1: Install Node.js
- Ensure Node.js **v20.x** or higher is installed (Tested on Node v24.19.0).
- Check installation:
  ```powershell
  node -v
  npm -v
  ```

### Step 2: Install Server Dependencies
```powershell
cd "d:\Management System\stitch_campusflow_operations_platform\server"
npm install
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env`:
```powershell
copy .env.example .env
```

### Step 4: Run Tests
Run the comprehensive Vitest test suite (7 test files, 57 tests):
```powershell
npm test
```

### Step 5: Start the Development Server
```powershell
npm run dev
```
The server will boot on `http://localhost:5000` with hot-reloading enabled.

---

## 2. Environment Variables Reference

| Variable Name | Required | Default / Example | Purpose / Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `development` | Operating environment (`development`, `test`, `production`). |
| `PORT` | No | `5000` | Port on which the Express server listens. |
| `MONGODB_URI` | No | `mongodb://localhost:27017/campusflow` | MongoDB connection URI. In dev/test, if connection fails, `mongodb-memory-server` spins up automatically. |
| `JWT_SECRET` | Yes | `dev_super_secret_jwt_key_...` | High-entropy string used to sign session JWTs. Must be >= 32 characters in production. |
| `JWT_EXPIRES_IN` | No | `7d` | Token lifetime (`1d`, `7d`, `24h`). |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed frontend origin for CORS with credentials. |
| `APP_BASE_URL` | No | `http://localhost:5000` | Base URL used to construct public payment links (`/pay/:token`). |
| **Razorpay Configuration** | | | |
| `RAZORPAY_TEST_MODE` | No | `true` | When `true`, uses `MockRazorpayProvider` allowing local checkout simulation without real keys. |
| `RAZORPAY_KEY_ID` | Conditional | `rzp_test_mockKey123` | Razorpay API Key ID (required if `RAZORPAY_TEST_MODE=false`). |
| `RAZORPAY_KEY_SECRET` | Conditional | `mockSecretKey456` | Razorpay Secret Key for HMAC signature verification. |
| `RAZORPAY_WEBHOOK_SECRET` | Conditional | `mockWebhookSecret789` | Secret for validating `X-Razorpay-Signature` on incoming webhooks. |
| **WhatsApp Meta Cloud API** | | | |
| `WHATSAPP_TEST_MODE` | No | `true` | When `true`, uses `MockWhatsAppProvider` which logs formatted messages to disk/memory. |
| `WHATSAPP_API_TOKEN` | Conditional | `EAAB...` | Meta Graph API Access Token with `whatsapp_business_messaging` permissions. |
| `WHATSAPP_PHONE_NUMBER_ID` | Conditional | `100234981293` | Meta Phone Number ID registered for the institutional number. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Conditional | `29384729103` | WhatsApp Business Account (WABA) ID. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Conditional | `campusflow_meta_verify_token_2026` | Token matched during Meta webhook challenge setup. |
| **Google Cloud Sheets API** | | | |
| `GOOGLE_SHEETS_TEST_MODE` | No | `true` | When `true`, uses in-memory 50-student realistic spreadsheet mock with bi-directional write-back. |
| `GOOGLE_CLIENT_ID` | Conditional | `...apps.googleusercontent.com` | Google Cloud OAuth2 Client ID for Spreadsheet read/write. |
| `GOOGLE_CLIENT_SECRET` | Conditional | `GOCSPX-...` | Google Cloud OAuth2 Client Secret. |
| `GOOGLE_REFRESH_TOKEN` | Conditional | `1//04...` | Long-lived refresh token granted by institutional Google Workspace Admin. |
| **Microsoft Graph API** | | | |
| `MICROSOFT_CLIENT_ID` | Conditional | `...` | Azure AD Application (Client) ID. |
| `MICROSOFT_CLIENT_SECRET` | Conditional | `...` | Azure AD Client Secret. |
| `MICROSOFT_TENANT_ID` | Conditional | `...` | Azure AD Directory (Tenant) ID for OneDrive/SharePoint Excel access. |

---

## 3. Switching from Mock to Live External Providers

When deploying for staging or live institutional pilot:

### To enable Live Razorpay:
1. In `.env`, set:
   ```env
   RAZORPAY_TEST_MODE=false
   RAZORPAY_KEY_ID=rzp_live_yourActualKey
   RAZORPAY_KEY_SECRET=yourActualSecretKey
   RAZORPAY_WEBHOOK_SECRET=yourActualWebhookSecret
   ```
2. In Razorpay Dashboard, set Webhook URL to:
   `https://<your-domain>/api/webhooks/razorpay`
   and subscribe to event: `payment.captured`.

### To enable Live WhatsApp Cloud API:
1. In `.env`, set:
   ```env
   WHATSAPP_TEST_MODE=false
   WHATSAPP_API_TOKEN=EAAByourPermanentSystemUserToken
   WHATSAPP_PHONE_NUMBER_ID=yourPhoneNumberId
   WHATSAPP_BUSINESS_ACCOUNT_ID=yourWabaId
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=yourChosenSecretToken
   ```
2. In Meta App Dashboard → WhatsApp → Configuration:
   - Callback URL: `https://<your-domain>/api/webhooks/whatsapp`
   - Verify Token: Matches `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Webhook field subscriptions: `messages`.

### To enable Live Google Sheets:
1. In `.env`, set:
   ```env
   GOOGLE_SHEETS_TEST_MODE=false
   GOOGLE_CLIENT_ID=yourClientId
   GOOGLE_CLIENT_SECRET=yourClientSecret
   GOOGLE_REFRESH_TOKEN=yourRefreshToken
   ```
