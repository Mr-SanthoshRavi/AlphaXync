# CampusFlow Operations Platform: External Integrations Guide

This guide walks administrators and DevOps engineers through configuring live production credentials for external services: **Google Sheets**, **Microsoft Excel (Graph API)**, **Razorpay Payment Gateway**, and **WhatsApp Business Cloud API**.

---

## 1. Google Sheets API v4 Integration

CampusFlow uses Google Sheets API v4 with OAuth2 to read student master sheets and perform asynchronous payment write-back.

### Prerequisites
- A Google Cloud Platform (GCP) account.
- Institutional Google Workspace admin permissions.

### Setup Steps
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project: `CampusFlow-Operations`.
3. Go to **APIs & Services > Library**, search for and enable:
   - **Google Sheets API**
   - **Google Drive API**
4. Configure **OAuth Consent Screen**:
   - User Type: **Internal** (if Google Workspace organization) or **External**.
   - Add scopes:
     - `https://www.googleapis.com/auth/spreadsheets`
     - `https://www.googleapis.com/auth/drive.readonly`
5. Go to **APIs & Services > Credentials**:
   - Click **Create Credentials > OAuth client ID**.
   - Application Type: **Web Application**.
   - Authorized redirect URIs: `https://<your-domain>/api/sync/oauth/google/callback`.
6. Save the generated `Client ID` and `Client Secret`.
7. Obtain a long-lived **Refresh Token** via the OAuth2 flow.
8. Add to your `.env`:
   ```env
   GOOGLE_SHEETS_TEST_MODE=false
   GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-your_google_client_secret
   GOOGLE_REFRESH_TOKEN=1//your_refresh_token
   ```

---

## 2. Microsoft Excel Online / OneDrive (Microsoft Graph API)

CampusFlow connects to Excel workbooks hosted on institutional SharePoint or OneDrive for Business via Microsoft Graph API.

### Setup Steps
1. Sign in to the [Azure Portal](https://portal.azure.com/).
2. Navigate to **Azure Active Directory > App registrations > New registration**.
   - Name: `CampusFlow Operations Bridge`.
   - Supported account types: **Accounts in this organizational directory only (Single tenant)**.
3. Once registered, copy the **Application (client) ID** and **Directory (tenant) ID**.
4. Go to **Certificates & secrets > Client secrets > New client secret**.
   - Set expiration to 24 months, click **Add**, and copy the **Value** immediately.
5. Go to **API permissions > Add a permission > Microsoft Graph > Application permissions**:
   - Add `Files.ReadWrite.All`.
   - Click **Grant admin consent for <Institution Name>**.
6. Add to your `.env`:
   ```env
   MICROSOFT_CLIENT_ID=your_azure_client_id
   MICROSOFT_CLIENT_SECRET=your_azure_secret_value
   MICROSOFT_TENANT_ID=your_azure_tenant_id
   ```

---

## 3. Razorpay Payment Gateway & Webhook Verification

CampusFlow protects all payment transactions through server-side Razorpay order generation and HMAC-SHA256 signature verification.

### Setup Steps
1. Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Navigate to **Settings > API Keys > Generate Key**.
   - Copy **Key Id** and **Key Secret**.
3. Navigate to **Settings > Webhooks > Add New Webhook**:
   - **Webhook URL**: `https://<your-domain>/api/webhooks/razorpay`
   - **Secret**: Generate a secure 32+ character random string.
   - **Active Events**: Check `payment.captured` and `payment.failed`.
4. Configure in `.env`:
   ```env
   RAZORPAY_TEST_MODE=false
   RAZORPAY_KEY_ID=rzp_live_yourActualKeyId
   RAZORPAY_KEY_SECRET=yourActualKeySecret
   RAZORPAY_WEBHOOK_SECRET=yourActualWebhookSecret
   ```
5. **Security Guarantee**:
   - Razorpay signatures are validated strictly against the unparsed raw request buffer (`req.rawBody`).
   - Duplicate webhook deliveries are rejected using `x-razorpay-event-id` tracking in the database.

---

## 4. WhatsApp Business Cloud API (Official Meta Platform)

CampusFlow utilizes the official WhatsApp Business Cloud API to deliver transactional receipts, greeting automations, and fee timeline notices directly to parents and students.

### Setup Steps
1. Navigate to the [Meta for Developers Portal](https://developers.facebook.com/).
2. Create an App of type **Business**: Name it `CampusFlow-Messaging`.
3. Add the **WhatsApp** product to your App.
4. Set up a **System User** in Meta Business Manager:
   - Assign the `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
   - Generate a **Permanent System User Access Token** (never use temporary 24h test tokens in production).
5. In the App dashboard under **WhatsApp > Getting Started**:
   - Copy the **Phone Number ID** (institutional sender number).
   - Copy the **WhatsApp Business Account (WABA) ID**.
6. Set up Webhooks in **WhatsApp > Configuration**:
   - **Callback URL**: `https://<your-domain>/api/webhooks/whatsapp`
   - **Verify Token**: Define a secret token (e.g., `campusflow_meta_verify_2026`).
   - Click **Verify and Save**.
   - Under Webhook fields, click **Subscribe** for `messages`.
7. Configure in `.env`:
   ```env
   WHATSAPP_TEST_MODE=false
   WHATSAPP_API_TOKEN=EAAB...your_permanent_access_token
   WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
   WHATSAPP_BUSINESS_ACCOUNT_ID=your_waba_id
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=campusflow_meta_verify_2026
   ```

### Pre-Approved Message Templates
Submit these templates in Meta Business Manager before launching automated notifications:

1. **`student_greeting`**:
   - Category: `UTILITY`
   - Body: `"Welcome {{1}} to {{2}}! Your institutional enrollment {{3}} is confirmed for academic year {{4}}."`
2. **`fee_reminder_due`**:
   - Category: `UTILITY`
   - Body: `"Dear Parent, tuition installment of ₹{{1}} for {{2}} is due on {{3}}. Pay securely online: {{4}}"`
3. **`payment_receipt`**:
   - Category: `UTILITY`
   - Body: `"Thank you! Payment of ₹{{1}} received for {{2}}. Receipt Number: {{3}}. Remaining Balance: ₹{{4}}."`
