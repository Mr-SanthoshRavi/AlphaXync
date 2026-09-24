# 🚀 AlphaXync Operations Platform - Run & Deployment Guide

இந்த ஆவணத்தில் **AlphaXync Operations Platform** (Backend & Frontend)-ஐ உள்ளூர் கணினியிலும் (Local) மற்றும் **Vercel** மூலமாக நேரலையிலும் (`http://xync.alphaprime.co.in/`) இயக்குவதற்கான முழு வழிகாட்டல்கள் கொடுக்கப்பட்டுள்ளன.

---

## 🌐 Official Production Domain & Branding
- **Official Branding**: `AlphaXync` (Beta v2.4 - Autonomous Institutional Operations & Protected Ledger)
- **Release Stage**: **BETA** (Configured for designated user pilot cohort)
- **Production Domain**: [http://xync.alphaprime.co.in/](http://xync.alphaprime.co.in/)

---

## ⚡ 1. விரைவு தொடக்கம் (Local Quick Start - ஒரே Command-ல் இயக்க)

Project-ன் root கோப்பகத்தில் (`stitch_campusflow_operations_platform`) ஒரு command மூலமாக Backend மற்றும் Frontend இரண்டையும் ஒன்றாக இயக்கலாம்:

```powershell
npm run dev
```

> **என்ன நடக்கும்?**
> - **Backend Server**: `http://localhost:5000` என்ற முகவரியில் தொடங்கும்.
> - **Frontend Web App**: `http://localhost:5173` என்ற முகவரியில் தொடங்கும்.
> - பிரவுசரில் [http://localhost:5173](http://localhost:5173) திறந்து பயன்படுத்தலாம்.

---

## 🖥️ 2. பரிந்துரைக்கப்படும் முறை (2 தனித்தனி Terminals-ல் இயக்குவது)

Backend மற்றும் Frontend-ன் logs-களை தனித்தனியாகத் தெளிவாகப் பார்க்க 2 தனித்தனி Terminal-களைப் பயன்படுத்துவது சிறந்தது.

### 🔹 Terminal 1: Backend Server-ஐ இயக்க

```powershell
cd server
npm run dev
```
- **Port**: `http://localhost:5000`
- **Output**: 
  - MongoDB Atlas Database உடன் இணையும்
  - Background Workers & Auto-sync Scheduler தொடங்கும்
  - Baileys WhatsApp Session இயங்கும்

---

### 🔹 Terminal 2: Frontend Client-ஐ இயக்க

```powershell
cd client
npm run dev
```
- **Port**: `http://localhost:5173`
- பிரவுசரைத் திறந்து [http://localhost:5173](http://localhost:5173) பார்க்கவும்.

---

## 🔑 3. உள்நுழைவு விவரங்கள் (Login Credentials)

System-ல் உள்நுழைய கீழ்க்கண்ட கணக்குகளைப் பயன்படுத்தவும்:

| பயனர் வகை (Role) | மின்னஞ்சல் (Email) | கடவுச்சொல் (Password) |
| :--- | :--- | :--- |
| **Institution Admin** | `admin@stxavier.edu` | `AdminPassword123!` |
| **Cashier Desk** | `cashier@stxavier.edu` | `AdminPassword123!` |

> 💡 **குறிப்பு**: ஒருவேளை கடவுச்சொல் reset செய்ய வேண்டியிருந்தால் `server` கோப்பகத்தில் `npx ts-node src/scripts/resetAdminPassword.ts` என்ற command-ஐ இயக்கலாம்.

---

## 📋 4. முதல் முறை அமைத்தல் (First-Time Setup - தேவையானவை)

நீங்கள் புதிய கணினியில் அல்லது முதல் முறையாக இந்த project-ஐ run செய்கிறீர்கள் என்றால், கீழ்க்கண்ட படிகளைப் பின்பற்றவும்:

### படி 1: Node.js உள்ளதா எனச் சரிபார்க்கவும்
Node.js (v18.x அல்லது v20.x+) நிறுவப்பட்டுள்ளதா எனச் சரிபார்க்க:
```powershell
node -v
npm -v
```

### படி 2: Root & Sub-projects Dependencies நிறுவுதல்
```powershell
# 1. Root dependencies
npm install

# 2. Server dependencies
cd server
npm install

# 3. Client dependencies
cd ../client
npm install
```

### படி 3: Server Environment Variables (.env)
- `server/.env` கோப்பு ஏற்கனவே உருவாக்கப்பட்டு configure செய்யப்பட்டுள்ளது.
- தேவைப்பட்டால் `server/.env.example` கோப்பிலிருந்து மாற்றங்களைச் சரிபார்க்கலாம்:
```powershell
# server கோப்பகத்தில்
copy .env.example .env
```

---

## 🌐 5. போர்ட் மற்றும் URL விவரங்கள் (URLs & Access Points)

| சேவை (Service) | முகவரி (URL) | விவரம் |
| :--- | :--- | :--- |
| **Frontend Web App** | [http://localhost:5173](http://localhost:5173) | முதன்மை Dashboard & Operations UI |
| **Backend REST API** | [http://localhost:5000](http://localhost:5000) | Express API Server |
| **Live Stream (SSE)** | `http://localhost:5000/api/dashboard/live-stream` | Real-time Server Sent Events |
| **Public Payment Link** | `http://localhost:5173/pay/:token` | மாணவர்களுக்கான கட்டணச் செலுத்துதல் பக்கம் |

---

## 🛠️ 6. பயனுள்ள பிற கட்டளைகள் (Useful Commands Cheat Sheet)

### Root Directory-லிருந்து இயக்கக்கூடியவை:
| Command | செயல்பாடு |
| :--- | :--- |
| `npm run dev` | Backend & Frontend இரண்டையும் ஒரே நேரத்தில் தொடங்கும் |
| `npm run dev:server` | Backend Server-ஐ மட்டும் இயக்கும் |
| `npm run dev:client` | Frontend Client-ஐ மட்டும் இயக்கும் |
| `npm run build` | Server மற்றும் Client இரண்டையும் build செய்யும் |
| `npm run build:server` | Server TypeScript code-ஐ compile செய்யும் (`dist/`) |
| `npm run build:client` | Client React code-ஐ production build செய்யும் (`dist/`) |
| `npm run test:server` | Server Automated Test Suite-ஐ இயக்கும் |

---

## 🔍 7. பிரச்சனைகள் மற்றும் தீர்வுகள் (Troubleshooting & FAQs)

### ❓ கேள்வி 1: Port 5000 அல்லது 5173 ஏற்கனவே பயன்பாட்டில் உள்ளது (EADDRINUSE) என்றால் என்ன செய்வது?
**தீர்வு**: அந்த போர்ட்டில் இயங்கும் பழைய process-ஐ நிறுத்தலாம்:
```powershell
# Port 5000-ல் இயங்கும் process PID-ஐக் கண்டுபிடிக்க:
netstat -ano | findstr :5000

# அந்த process-ஐ நிறுத்த (PID எண்ணை உள்ளிடவும்):
taskkill /PID <PID_NUMBER> /F
```

### ❓ கேள்வி 2: MongoDB Connection பிரச்சனை வந்தால்?
**தீர்வு**: 
- `server/.env` கோப்பில் MongoDB Atlas URI உள்ளது.
- இணையம் இல்லாத போது அல்லது MongoDB இணைப்பு தடைபட்டால், சிஸ்டம் தானாகவே **In-Memory MongoDB (`mongodb-memory-server`)** முறைக்கு மாறிவிடும்! எனவே எவ்வித தடங்கலும் இன்றி project இயங்கும்.

### ❓ கேள்வி 3: WhatsApp QR Code இணைப்பது எப்படி?
**தீர்வு**:
- பிரவுசரில் Settings பக்கம் சென்று WhatsApp tab-ல் QR Code-ஐ WhatsApp App மூலமாக Scan செய்யலாம்.
- ஏற்கனவே இணைக்கப்பட்ட session `.baileys_auth_info/` கோப்பகத்தில் சேமிக்கப்படுவதால், Server-ஐ restart செய்தாலும் மீண்டும் QR scan செய்யத் தேவையில்லை (Auto-reconnect இயங்கும்).

---

## ☁️ 8. நேரலை தயாரிப்பு வெளியீடு (Production Deployment: Render Backend + Vercel Frontend)

AlphaXync சிஸ்டத்தில் **WhatsApp Web (Baileys QR Scan)** 24/7 தடையின்றி இயங்கவும், **Frontend** அதிவேகமாக இயங்கவும் **Dual-Hosting Architecture** பரிந்துரைக்கப்படுகிறது:
- **Frontend**: **Vercel** (`https://xync.alphaprime.co.in/`) - High-Speed Global CDN SPA
- **Backend Server**: **Render.com** (Free Web Service) - 24/7 Persistent WebSocket & Baileys Session Server

---

### 🔹 பகுதி A: Render.com-ல் Backend Server Deploy செய்யும் முறை

1. [Render.com](https://render.com) சென்று கணக்கில் நுழையவும்.
2. **New +** ➔ **Web Service** என்பதைத் தேர்ந்தெடுக்கவும்.
3. உங்கள் GitHub Repository-ஐ இணைக்கவும் (`stitch_campusflow_operations_platform` அல்லது `AlphaXync`).
4. பின்வரும் அமைப்புகளை (Settings) உள்ளிடவும்:
   - **Name**: `alphaxync-backend` (அல்லது நீங்கள் விரும்பும் பெயர்)
   - **Region**: `Singapore` (இந்தியாவுக்கு மிக அருகில் உள்ளதால் குறைவான latency)
   - **Branch**: `main`
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

5. **Render Environment Variables** (Environment tab-ல் சேர்க்க வேண்டியவை):
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://studifydb:sandy123@alpharoom.2me2xjx.mongodb.net/?appName=Alpharoom
SESSION_SECRET=campusflow_super_secret_session_key_32bytes_min
JWT_SECRET=campusflow_jwt_access_secret_key_2026_x992
JWT_REFRESH_SECRET=campusflow_jwt_refresh_secret_key_2026_y883
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
RESEND_KEY=re_g6zoXagc_NmQa117W5dTCdS27wN8JDsqB

# Cloudinary
CLOUDINARY_API_KEY=933662793875848
CLOUDINARY_API_SECRET=RytawIRzXJIYxbTiva7t5TJ8GTI
CLOUDINARY_NAME=bqzs1991

# Razorpay
PAYMENT_MODE=test
RAZORPAY_KEY_ID=rzp_test_Tejked95D4vLYJ
RAZORPAY_KEY_SECRET=jBZKTurn6HniCghBEH7rjcUA
RAZORPAY_WEBHOOK_SECRET=rzp_webhook_secret_mock998877

# Real WhatsApp Baileys & Real Mode (NO MOCK!)
WHATSAPP_PROVIDER=baileys
APP_MODE=real
MIN_SEND_INTERVAL_MS=10000
OUTBOUND_CONCURRENCY=1
CIRCUIT_BREAKER_FAILURES=5

# Production Frontend Domain
CLIENT_URL=https://xync.alphaprime.co.in

# Google Sheets OAuth
GOOGLE_CLIENT_ID=1026636982173-nj1kulf07n0mk84g4b5ie922q368mfkm.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_REDIRECT_URI=https://alphaxync-backend.onrender.com/api/connections/google/callback

# AI & Captcha
AI_ENABLED=true
AI_PROVIDER_KEY=AQ.Ab8RN6K6PmIqNAxN0_raS9mxN1YnIW93eQC55QDE3Tkg8gjr_g
RECAPTCHA_SITE_KEY=6LdaGswtAAAAADrMcAW3-eMPm1zirbF2EbluTQor
RECAPTCHA_SECRET_KEY=6LdaGswtAAAAACH7qhvXLM2b7VS2mp2fuiAKjXSj
```
*(குறிப்பு: உங்கள் Render URL வந்ததும் `GOOGLE_REDIRECT_URI`-ல் அந்த சரியான Render URL-ஐ மாற்றவும்).*

6. **Create Web Service** கிளிக் செய்யவும். Render Build முடிந்து சர்வர் **Live** ஆனதும் உங்கள் Render Backend URL கிடைக்கும் (e.g. `https://alphaxync-backend.onrender.com`).

---

### 🔹 பகுதி B: Vercel-ல் Frontend Deploy செய்யும் முறை

1. [Vercel.com](https://vercel.com) Dashboard செல்லவும்.
2. **Add New...** ➔ **Project** கிளிக் செய்து உங்கள் GitHub Repository-ஐ Import செய்யவும்.
3. **Project Settings**:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (Root)
   - **Build Command**: `npm run build:client`
   - **Output Directory**: `client/dist`
   - **Install Command**: `npm install --include=dev && npm --prefix client install --include=dev && npm --prefix server install --include=dev`

4. **Vercel Environment Variables** (Settings ➔ Environment Variables):
   இங்கே **2 மாறிகள் மட்டுமே போதுமானது** (Mock mode எதையும் சேர்க்க வேண்டாம்!):
```env
VITE_API_URL=https://alphaxync-backend.onrender.com
VITE_RECAPTCHA_SITE_KEY=6LdaGswtAAAAADrMcAW3-eMPm1zirbF2EbluTQor
```
*(குறிப்பு: `VITE_API_URL`-ல் உங்கள் உண்மையான Render Backend URL-ஐ உள்ளிடவும்).*

5. **Deploy** கிளிக் செய்யவும்.

---

### 🔹 பகுதி C: Custom Domain இணைத்தல் (`https://xync.alphaprime.co.in/`)

1. Vercel Project Dashboard ➔ **Settings** ➔ **Domains** செல்லவும்.
2. `xync.alphaprime.co.in` என்று type செய்து **Add** கொடுக்கவும்.
3. உங்கள் DNS Manager-ல் (Cloudflare / Namecheap / Hostinger / GoDaddy):
   - **Type**: `CNAME`
   - **Name**: `xync`
   - **Target / Value**: `cname.vercel-dns.com`
   - **Proxy Status**: DNS Only (Cloudflare என்றால் Grey cloud)
4. DNS சரிபார்க்கப்பட்டதும், Vercel தானாகவே Free SSL Certificate வழங்கி **`https://xync.alphaprime.co.in/`** நேரலையாக இயங்கும்!

---

### 📱 வாட்ஸ்அப் இணைப்பு எப்படி வேலை செய்யும்?
* நீங்கள் `https://xync.alphaprime.co.in/` திறந்து Settings ➔ WhatsApp Linking சென்று **Connect WhatsApp** கொடுத்தால், Render Backend-ல் உள்ள Baileys Web Socket தொடங்கி, Localhost போலவே நேரலையான **Real QR Code** திரையில் தோன்றும்!
* உங்கள் மொபைலில் Scan செய்தவுடன் உங்கள் சொந்த WhatsApp எண் இணைக்கப்பட்டு 24/7 தொடர்ந்து இயங்கும்!

