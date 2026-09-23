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

## ☁️ 8. Vercel-ல் Deploy செய்து Domain இணைக்கும் முறை (Vercel Deployment & Domain Setup)

உங்கள் குறிப்பிட்ட பயனர்களுக்காக (Set of Users) Vercel-ல் Deploy செய்து `http://xync.alphaprime.co.in/` domain-ஐ இணைக்க:

### படி 1: Vercel CLI அல்லது GitHub மூலம் Deploy செய்தல்
1. Vercel CLI நிறுவப்பட்டு இருந்தால்:
```powershell
npx vercel
```
அல்லது GitHub Repository-ஐ Vercel Dashboard-ல் Import செய்யவும்.
Root-ல் ஏற்கனவே **`vercel.json`** தயார் செய்யப்பட்டுள்ளது.

### படி 2: Vercel Project Settings-ல் Environment Variables சேர்க்கவும்
Vercel Project Dashboard ➔ **Settings** ➔ **Environment Variables** சென்று கீழ்க்கண்டவற்றை உள்ளிடவும்:
- `MONGODB_URI`: உங்கள் MongoDB Atlas connection string
- `JWT_SECRET`: உங்கள் JWT secret key
- `JWT_REFRESH_SECRET`: உங்கள் Refresh token secret key
- `SESSION_SECRET`: உங்கள் Session secret key
- `RESEND_KEY`: உங்கள் Resend API key (OTP மின்னஞ்சல்களுக்கு)
- `GEMINI_API_KEY`: உங்கள் Google Gemini AI key (AI Copilot-க்கு)
- `NODE_ENV`: `production`

### படி 3: Custom Domain இணைத்தல் (`http://xync.alphaprime.co.in/`)
1. Vercel Dashboard ➔ **Settings** ➔ **Domains** செல்லவும்.
2. `xync.alphaprime.co.in` என்று type செய்து **Add** கொடுக்கவும்.
3. உங்கள் DNS Manager-ல் (e.g. Cloudflare / Namecheap / GoDaddy) பின்வரும் CNAME Record-ஐ சேர்க்கவும்:
   - **Type**: `CNAME`
   - **Name**: `xync`
   - **Value / Target**: `cname.vercel-dns.com`
4. DNS propagate ஆனவுடன், உங்கள் தளம் தானாகவே `http://xync.alphaprime.co.in/` மற்றும் HTTPS-ல் நேரலையாக இயங்கும்!

