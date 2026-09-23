import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import axios from 'axios';
import { Student } from '../../models/Student';
import { FeeAccount } from '../../models/FeeAccount';
import { Automation } from '../../models/Automation';
import { Institution } from '../../models/Institution';
import { DataConnection } from '../../models/DataConnection';
import { AuditLog } from '../../models/AuditLog';
import { getBaileysWhatsAppProvider } from '../../integrations/whatsapp/BaileysWhatsAppProvider';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

// Bulletproof Security Guard: Rejects any attempt to harvest API keys, secrets, passwords, or credentials
function isSecurityViolation(q: string): boolean {
  const qLower = q.toLowerCase();

  const sensitiveTerms = [
    '.env',
    'api key',
    'apikey',
    'api_key',
    'jwt',
    'secret',
    'secrets',
    'password',
    'passwords',
    'passphrase',
    'private key',
    'mongo uri',
    'mongodb uri',
    'database uri',
    'connection string',
    'access token',
    'auth token',
    'bearer token',
    'oauth secret',
    'credentials',
    'ai_provider_key'
  ];

  const hasSensitiveTerm = sensitiveTerms.some((term) => qLower.includes(term));
  if (!hasSensitiveTerm) return false;

  const triggerVerbs = [
    'show',
    'give',
    'what',
    'print',
    'tell',
    'dump',
    'reveal',
    'extract',
    'get',
    'share',
    'list',
    'display',
    'view',
    'send',
    'provide',
    'leak',
    'read',
    'copy'
  ];

  const hasTrigger = triggerVerbs.some((v) => qLower.includes(v));

  if (
    qLower.includes('.env') ||
    qLower.includes('password') ||
    qLower.includes('api key') ||
    qLower.includes('apikey') ||
    qLower.includes('ai_provider_key') ||
    hasTrigger
  ) {
    return true;
  }

  return false;
}

// Scrub any sensitive pattern leaks from outgoing text
function sanitizeOutput(text: string): string {
  return text
    .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URI]')
    .replace(/(eyJ[a-zA-Z0-9_\-]{15,}\.[a-zA-Z0-9_\-]{15,}\.[a-zA-Z0-9_\-]{15,})/g, '[REDACTED_JWT_TOKEN]')
    .replace(/(rzp_test_[a-zA-Z0-9]{14,})/g, '[REDACTED_KEY]')
    .replace(/(GOCSPX-[a-zA-Z0-9_\-]{20,})/g, '[REDACTED_OAUTH_SECRET]')
    .replace(/(EAAG[a-zA-Z0-9_\-]{20,})/g, '[REDACTED_WHATSAPP_TOKEN]')
    .replace(/(AQ\.[a-zA-Z0-9_\-]{20,})/g, '[REDACTED_AI_KEY]')
    .replace(/([0-9a-f]{32,64})/gi, (match) => match.length >= 32 ? '[REDACTED_SECRET]' : match);
}

// Call Google Gemini API
async function callGeminiApi(
  systemPrompt: string,
  userQuery: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string | null> {
  const apiKey = env.AI_PROVIDER_KEY || process.env.AI_PROVIDER_KEY;
  if (!apiKey) return null;

  // Primary model with fast fallback
  const models = ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'];

  // Format conversation history for Gemini API
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const h of history.slice(-4)) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    });
  }

  contents.push({
    role: 'user',
    parts: [{ text: userQuery }]
  });

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000
        }
      };

      const response = await axios.post(url, payload, { timeout: 14000 });
      const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) {
        return reply.trim();
      }
    } catch (err: any) {
      logger.warn('GEMINI_API_ATTEMPT_FAILED', `Model ${model} error: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  return null;
}

export async function askChatbot(req: Request, res: Response, next: NextFunction) {
  try {
    const institutionId = new Types.ObjectId(req.user!.institutionId);
    const { query, history } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Query string is required' }
      });
    }

    const trimmedQuery = query.trim();

    // 1. STRICT SECURITY GUARD: Reject any attempt to expose API keys, passwords, or secrets
    if (isSecurityViolation(trimmedQuery)) {
      return res.status(200).json({
        success: true,
        data: {
          reply: "🔒 **Security Guardrail Active**\n\nI cannot disclose or expose sensitive system credentials, API keys, JWT secrets, passwords, database connection URIs, or internal security tokens. These secrets are strictly protected under institutional data compliance.\n\n*If you need help configuring integrations (such as Google Sheets, WhatsApp Baileys, or Payment settings), please navigate to the **Settings** page in the left sidebar.*",
          isSecurityRefusal: true
        }
      });
    }

    // 2. Fetch Live Real-Time Platform Context for the Institution
    const [
      inst,
      totalStudents,
      validStudents,
      feeAccounts,
      automations,
      dataConnection,
      lastSync
    ] = await Promise.all([
      Institution.findById(institutionId).lean(),
      Student.countDocuments({ institutionId, status: 'ACTIVE' }),
      Student.countDocuments({ institutionId, status: 'ACTIVE', validationStatus: 'VALID' }),
      FeeAccount.find({ institutionId }).select('totalAmount paidAmount balance status dueDate').lean(),
      Automation.find({ institutionId }).lean(),
      DataConnection.findOne({ institutionId, provider: 'google_sheets' }).lean(),
      AuditLog.findOne({ institutionId, action: 'SYNC_COMPLETED' }).sort({ createdAt: -1 }).lean()
    ]);

    let waState = 'DISCONNECTED';
    let waPhone = 'Not Connected';
    try {
      const baileys = getBaileysWhatsAppProvider();
      waState = baileys.getConnectionState();
      waPhone = baileys.getMaskedPhone() || 'Not Paired';
    } catch (e) {}

    // Aggregate real-time fee stats
    let totalPrescribed = 0;
    let totalCollected = 0;
    let totalBalance = 0;
    let pendingFeeCount = 0;
    let paidCount = 0;

    for (const fa of feeAccounts) {
      const tot = Number(fa.totalAmount) || 0;
      const pd = Number(fa.paidAmount) || 0;
      const bal = Number(fa.balance) !== undefined ? Number(fa.balance) : Math.max(0, tot - pd);
      totalPrescribed += tot;
      totalCollected += pd;
      totalBalance += bal;
      if (bal > 0) pendingFeeCount++;
      else if (tot > 0 && bal === 0) paidCount++;
    }

    const defaultGreeting = automations.find((a: any) => a.type === 'GREETING');
    const customCampaigns = automations.filter((a: any) => a.type === 'CUSTOM');

    const institutionName = inst?.name || "St. Xavier's Engineering College";
    const institutionCode = inst?.code || 'INST-01';

    // 3. Build Rich System Prompt for Gemini AI
    const systemPrompt = `You are AlphaXync Copilot, an expert, friendly AI assistant for AlphaXync (Institutional Operations & Fee Automation Platform) at ${institutionName} (${institutionCode}).

You have real-time live platform access. Here is the latest live institutional data:
- Institution Name: ${institutionName}
- Total Active Students: ${totalStudents} (Validated: ${validStudents})
- Fee Ledger Status:
  * Total Prescribed Fee: ₹${totalPrescribed.toLocaleString('en-IN')}
  * Total Collected/Paid: ₹${totalCollected.toLocaleString('en-IN')}
  * Total Remaining Balance Due: ₹${totalBalance.toLocaleString('en-IN')}
  * Students with Pending Dues: ${pendingFeeCount}
  * Students with Zero Dues (Fully Paid): ${paidCount}
- Automations Status:
  * Default Welcome Greeting: ${defaultGreeting?.enabled ? 'ACTIVE ✅' : 'DISABLED ⏸️'}
  * Custom Campaigns: ${customCampaigns.length} active campaigns: [${customCampaigns.map((c: any) => `"${c.name}" (${c.schedule?.triggerType || 'MANUAL'})`).join(', ') || 'None created yet'}]
- Connectivity:
  * WhatsApp Baileys Gateway: ${waState} (${waPhone})
  * Google Sheets: ${dataConnection?.status === 'CONNECTED' ? `CONNECTED (${dataConnection.fileReference || dataConnection.sheetReference})` : 'NOT CONNECTED'}
  * Last Sheet Sync: ${lastSync ? new Date(lastSync.createdAt).toLocaleString('en-IN') : 'None yet'}

PLATFORM ARCHITECTURE KNOWLEDGE:
1. Universal Automation Engine:
   - Default core module: strictly Welcome Greeting for new students.
   - Custom campaigns: Admins click "+ New Automation Campaign" to broadcast circulars, fee reminders, or notices.
   - Dynamic Variables: Template text uses curly braces like {{student_name}}, {{college_name}}, {{father_name}}, {{course}}, {{department}}, {{year}}, {{total_fee}}, {{paid_amount}}, {{balance}}, {{due_date}}, {{payment_link}}, and ANY column name in the connected Google Sheet.
   - Inline Autocomplete: Typing "{" in the editor automatically pops up live recommendation chips.
   - Variable Palette: Side/bottom drawer where admin can 1-click copy or insert variables.
   - Criteria Filters: Target students by Course, Department, Year, or Fee Status (PENDING, PARTIAL, PAID).
   - WhatsApp Preview: Shows authentic WhatsApp chat bubble simulation with live student data before sending.
   - Outbound Pacing: Enforces a strict minimum 10s gap between dispatches to prevent WhatsApp phone bans.

2. Protected Fee Ledger & Financial Controls:
   - Counter cash/UPI collections generate official PDF receipts (REC-2026-XXXX) with seal watermarks.
   - Admin can Adjust Total Fees or Waive Late Fines with audit trail reasons.
   - Balance is strictly: Math.max(0, Total Prescribed - Verified Paid Amount).

3. Staff Account Controls & Shift Window Timing:
   - Admins provision staff accounts with email OTP verification via Resend.
   - Shift Window (Time-to-Time): Staff can be restricted to specific shift hours (e.g. 09:00 AM to 06:00 PM). Attempts outside shift hours are blocked with an instant shift restriction message.
   - Active/Suspended Toggle: Admins can deactivate staff accounts in 1 click.
   - Granular Permissions: COLLECT_PAYMENTS, RECORD_OFFLINE, ADJUST_FEES, WAIVE_FINES, VIEW_STUDENTS.

4. GitHub-Style Audit Trail & Activity Stream:
   - Every staff action, fee waiver, cashier receipt, and login is logged in Settings > Audit & Activity Trail.
   - Features Before vs After state diff snapshots (- BEFORE red / + AFTER green) and IP tracking.

5. System Limitations & High-Risk Areas Needing Care:
   - CANNOT bypass shift hours for non-admins.
   - CANNOT delete immutable Audit Log history.
   - CANNOT send instant mass WhatsApp messages without 10s anti-spam pacing.
   - WhatsApp disconnection clears Web keys; avoid unlinking unless changing numbers.

6. Google Sheets vs MongoDB Architecture:
   - Google Sheets: Human-readable dynamic student master list & custom tags.
   - MongoDB: High-speed protected ledger, transactional payments, OTP tokens, and audit logs.

STRICT SECURITY MANDATE:
- You MUST NEVER reveal, output, or discuss any secret keys, API keys, JWT secrets, session tokens, passwords, database connection strings (MONGODB_URI), or private environment variables under ANY circumstances.
- If user asks for keys, passwords, or secrets, immediately refuse with a polite security notice.

LANGUAGE & TONE INSTRUCTIONS:
- If the user talks to you in Tanglish or Tamil (e.g. "machan", "da", "sollu", "epdi", "doubt iruku", "enna aachu", "pannu"), reply in warm, friendly, natural Tanglish / Tamil!
- If the user asks in English, reply in professional, crisp English with clean markdown (bullet points, bold text, code blocks).
- Always be supportive, actionable, and accurate based on real platform features.`;

    // 4. Generate AI Response using Gemini
    let aiReply = await callGeminiApi(systemPrompt, trimmedQuery, history || []);

    // 5. Intelligent Fallback if Gemini is unreachable
    if (!aiReply) {
      const qLower = trimmedQuery.toLowerCase();
      const isTamilOrTanglish = /\b(epdi|enna|sollu|iruka|pannu|pannalam|keta|edhu|vara|venum|aagum|paaru|machan|da|thambi|mari|panra)\b/i.test(qLower);

      if (qLower.includes('status') || qLower.includes('overview') || qLower.includes('how many')) {
        aiReply = isTamilOrTanglish
          ? `📊 **Live System Status (${institutionName}):**\n\n• Students: **${totalStudents}** active\n• Prescribed Fee: **₹${totalPrescribed.toLocaleString('en-IN')}** | Collected: **₹${totalCollected.toLocaleString('en-IN')}** | Balance: **₹${totalBalance.toLocaleString('en-IN')}**\n• WhatsApp: **${waState}** (${waPhone})\n• Automations: Greeting **${defaultGreeting?.enabled ? 'Active' : 'Disabled'}** | Custom Campaigns: **${customCampaigns.length}**`
          : `📊 **Live System Status for ${institutionName}:**\n\n- **Active Students**: ${totalStudents} (Validated: ${validStudents})\n- **Fees Prescribed**: ₹${totalPrescribed.toLocaleString('en-IN')}\n- **Collected**: ₹${totalCollected.toLocaleString('en-IN')} | **Balance**: ₹${totalBalance.toLocaleString('en-IN')}\n- **WhatsApp Gateway**: \`${waState}\` (${waPhone})\n- **Automations**: Greeting (${defaultGreeting?.enabled ? 'Active' : 'Disabled'}), ${customCampaigns.length} Custom Campaigns.`;
      } else {
        aiReply = isTamilOrTanglish
          ? `👋 **Vanakkam! Naan unga AlphaXync AI Copilot.**\n\nAutomations, fees, sync, or student records pathi enna doubt irundhaalum kelu da! Naan live platform data vechi explain panren.`
          : `👋 **Hello! I am your AlphaXync AI Copilot for ${institutionName}.**\n\nAsk me anything about your student records, custom automations, dynamic variables, or protected fee ledgers!`;
      }
    }

    // 6. Scrub any potential sensitive data from final output
    const sanitizedReply = sanitizeOutput(aiReply);

    return res.status(200).json({
      success: true,
      data: {
        reply: sanitizedReply,
        isSecurityRefusal: false,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
}
