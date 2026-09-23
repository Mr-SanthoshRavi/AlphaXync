# CampusFlow Operations Platform: Production Deployment Guide

This guide details deploying CampusFlow to production as a lightweight, zero-maintenance modular monolith (Node.js + Express + TypeScript + MongoDB) without external queue infrastructure (no Redis, Kafka, or RabbitMQ required).

---

## 1. Production Architecture Overview

CampusFlow is intentionally packaged as a self-contained monolith:

```
                          Internet (Clients & Webhooks)
                                       │
                                       ▼ HTTPS (Port 443)
                         ┌───────────────────────────┐
                         │   Nginx / Cloudflare CDN  │
                         └─────────────┬─────────────┘
                                       │ Reverse Proxy (Port 5000)
                                       ▼
       ┌───────────────────────────────────────────────────────────────┐
       │                   CampusFlow Modular Monolith                 │
       │                                                               │
       │  ┌────────────────────┐   ┌────────────────────────────────┐  │
       │  │  Express REST API  │   │  In-Process Background Workers │  │
       │  │  • Auth & RBAC     │   │  • Atomic Job Claiming (Mongo) │  │
       │  │  • Rate Limiting   │   │  • Sync & Conflict Engine      │  │
       │  │  • Webhooks        │   │  • Automation Timeline Worker  │  │
       │  │  • Payment Ledger  │   │  • WhatsApp Message Worker     │  │
       │  └────────────────────┘   └────────────────────────────────┘  │
       └───────────────────────────────┬───────────────────────────────┘
                                       │
                                       ▼ TLS 1.3 / SCRAM-SHA-256
                         ┌───────────────────────────┐
                         │   MongoDB Atlas Cluster   │
                         │    (Replica Set Primary)  │
                         └───────────────────────────┘
```

---

## 2. Option A: Cloud PaaS Deployment (Render / Koyeb / Railway)

### Step 1: Set Up MongoDB Atlas
1. Create a MongoDB Atlas account at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Provision an M0 (for staging) or M10+ (for production) cluster with **replica sets enabled** (required for atomic multi-document transactions).
3. Under **Database Access**, create a user `campusflow_app` with read/write permissions.
4. Under **Network Access**, add the IP address of your application host (or `0.0.0.0/0` with strong authentication).
5. Copy your connection string:
   ```
   mongodb+srv://campusflow_app:<password>@cluster0.abcde.mongodb.net/campusflow?retryWrites=true&w=majority
   ```

### Step 2: Deploy to Render / Koyeb
1. Connect your Git repository.
2. Configure Build & Start settings:
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/server.js`
3. Configure Environment Variables in the provider dashboard:
   - `NODE_ENV=production`
   - `PORT=5000`
   - `MONGODB_URI=mongodb+srv://...`
   - `JWT_SECRET=<generate_high_entropy_32_char_secret>`
   - `CORS_ORIGIN=https://admin.yourinstitution.edu`
   - `APP_BASE_URL=https://campusflow.yourinstitution.edu`
   - Razorpay, WhatsApp, and Google credentials as documented in `ENV_SETUP.md`.
4. Set Health Check Path: `/health`.

---

## 3. Option B: Self-Hosted Linux VPS (Ubuntu 22.04 / 24.04 LTS)

### Step 1: Install Node.js & PM2
```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

# Install PM2 Process Manager globally
sudo npm install -g pm2
```

### Step 2: Deploy Code & Build
```bash
# Clone repository
git clone <your-repo-url> /var/www/campusflow
cd /var/www/campusflow/server

# Install dependencies and compile TypeScript
npm ci --omit=dev
npm run build

# Set production permissions
sudo chown -R www-data:www-data /var/www/campusflow
```

### Step 3: Configure PM2 Process
Create `/var/www/campusflow/server/ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'campusflow-api',
      script: './dist/server.js',
      instances: 1, // Single instance handles in-process cron and atomic job polling
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};
```
Start the service:
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### Step 4: Configure Nginx Reverse Proxy with SSL
Install Nginx and Certbot:
```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Configure `/etc/nginx/sites-available/campusflow`:
```nginx
server {
    listen 80;
    server_name campusflow.yourinstitution.edu;

    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Keep alive for SSE streams (/api/dashboard/live-stream)
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }
}
```
Enable site and obtain SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/campusflow /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d campusflow.yourinstitution.edu
```

---

## 4. Production Verification & Monitoring

### Health Checks
- `GET https://campusflow.yourinstitution.edu/health` -> `{ status: "ok", uptime: 12345 }`
- `GET https://campusflow.yourinstitution.edu/ready` -> `{ status: "ready", database: "connected" }`

### Log Inspection
- Via PM2:
  ```bash
  pm2 logs campusflow-api --lines 100
  ```
- All structured JSON logs output timestamps, events (`PAYMENT_CAPTURED`, `SYNC_CONFLICT_DETECTED`, `WHATSAPP_DISPATCH_SUCCESS`), and audit details.

### Backup Policy
- Enable **Continuous Cloud Backups** in MongoDB Atlas (point-in-time recovery for 35 days).
- For self-hosted instances, configure a daily `mongodump` cron job uploading compressed archives to encrypted institutional S3 storage.
