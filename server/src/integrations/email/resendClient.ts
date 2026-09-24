import { logger } from '../../utils/logger';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export class ResendEmailService {
  private apiKey: string;
  // Use verified domain if available, fallback to onboarding@resend.dev
  private defaultFrom: string;

  constructor() {
    this.apiKey = process.env.RESEND_KEY || '';
    this.defaultFrom = process.env.RESEND_FROM_EMAIL || 'AlphaXync Security <auth@mail.alphaprime.co.in>';
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const { to, subject, html, text, from } = options;
    const apiKey = this.apiKey || process.env.RESEND_KEY;

    if (!apiKey) {
      logger.error('RESEND_CONFIG_MISSING', 'RESEND_KEY is missing in environment variables.');
      return { success: false, error: 'Email service configuration missing (RESEND_KEY).' };
    }

    const recipients = Array.isArray(to) ? to : [to];
    const sender = from || this.defaultFrom;

    try {
      let response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify({
          from: sender,
          to: recipients,
          subject,
          html,
          text: text || html.replace(/<[^>]*>?/gm, '')
        })
      });

      let data: any = await response.json().catch(() => ({}));

      // If custom domain fails (e.g. sender unverified), gracefully fallback to onboarding@resend.dev
      if (!response.ok && sender !== 'AlphaXync <onboarding@resend.dev>') {
        logger.warn('RESEND_PRIMARY_SENDER_FAILED', `Sender ${sender} rejected (${data?.message}). Retrying via secondary verified sender...`);
        
        const fallbackSender = sender.includes('alphaprime') 
          ? 'AlphaXync <auth@walpha.in>' 
          : 'AlphaXync <onboarding@resend.dev>';

        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey.trim()}`
          },
          body: JSON.stringify({
            from: fallbackSender,
            to: recipients,
            subject,
            html,
            text: text || html.replace(/<[^>]*>?/gm, '')
          })
        });
        data = await response.json().catch(() => ({}));
      }

      if (!response.ok) {
        const errorMsg = data?.message || `HTTP ${response.status} ${response.statusText}`;
        logger.error('RESEND_SEND_ERROR', `Failed to send email to ${recipients.join(', ')}: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      logger.info('RESEND_EMAIL_SENT', `Email sent successfully to ${recipients.join(', ')} (ID: ${data.id})`);
      return { success: true, id: data.id };
    } catch (err: any) {
      logger.error('RESEND_FETCH_EXCEPTION', `Exception while sending email: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async sendOtpEmail(to: string, otp: string, purpose: 'INITIAL_SETUP' | 'STAFF_FIRST_LOGIN' | 'LOGIN_OTP' | 'PASSWORD_RESET', recipientName?: string): Promise<SendEmailResult> {
    const title = purpose === 'INITIAL_SETUP' 
      ? 'Verify Institution Admin Setup' 
      : purpose === 'STAFF_FIRST_LOGIN'
      ? 'Staff Account Security Verification'
      : purpose === 'PASSWORD_RESET'
      ? 'Reset Your AlphaXync Password'
      : 'AlphaXync Security Verification';

    const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
    const subtext = purpose === 'INITIAL_SETUP'
      ? 'You are initializing your institution account on AlphaXync. Please use the verification code below to confirm your administrator email address.'
      : purpose === 'PASSWORD_RESET'
      ? 'You have requested to reset your password. Please use the 6-digit verification code below to securely reset your password.'
      : 'You are logging in to your AlphaXync Staff account for the first time. Please use the verification code below to verify your email and activate your session.';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
    .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #004ac6; padding: 32px 24px; text-align: center; color: #ffffff; }
    .logo-badge { display: inline-block; background: #ffffff; color: #004ac6; font-weight: 800; font-size: 20px; width: 44px; height: 44px; line-height: 44px; border-radius: 12px; margin-bottom: 12px; }
    .title { font-size: 22px; font-weight: 700; margin: 0; }
    .subtitle { font-size: 13px; opacity: 0.85; margin-top: 6px; }
    .body { padding: 32px 28px; }
    .greeting { font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 8px; }
    .desc { font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0; }
    .otp-box { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp-label { font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; color: #64748b; margin-bottom: 8px; }
    .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #004ac6; margin: 0; }
    .expiry { font-size: 12px; color: #64748b; margin-top: 8px; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #92400e; line-height: 1.5; margin: 24px 0; }
    .footer { border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo-badge">A</div>
      <h1 class="title">AlphaXync</h1>
      <div class="subtitle">Autonomous Institutional Operations Platform</div>
    </div>
    <div class="body">
      <div class="greeting">${greeting}</div>
      <p class="desc">${subtext}</p>
      
      <div class="otp-box">
        <div class="otp-label">Your One-Time Security Code</div>
        <div class="otp-code">${otp}</div>
        <div class="expiry">⏱️ Valid for 10 minutes. Do not share this code.</div>
      </div>

      <div class="warning">
        <strong>Security Notice:</strong> If you did not attempt to sign in or set up an account on AlphaXync, please ignore this email. Your account remains completely secure.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} AlphaXync Platform. Protected by institutional multi-factor verification.
    </div>
  </div>
</body>
</html>
    `;

    return this.sendEmail({
      to,
      subject: `[${otp}] Your AlphaXync Verification Code`,
      html
    });
  }

  async sendStaffInvitationEmail(to: string, staffName: string, role: string, tempPassword?: string, institutionName?: string): Promise<SendEmailResult> {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
    .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #004ac6; padding: 32px 24px; text-align: center; color: #ffffff; }
    .title { font-size: 22px; font-weight: 700; margin: 0; }
    .body { padding: 32px 28px; }
    .credentials { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 20px 0; }
    .cred-row { font-size: 13px; margin: 6px 0; }
    .cred-label { color: #64748b; font-weight: 600; width: 100px; display: inline-block; }
    .cred-val { color: #0f172a; font-family: monospace; font-weight: 700; }
    .notice { font-size: 13px; color: #475569; line-height: 1.5; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 class="title">Welcome to AlphaXync</h1>
      <div style="font-size: 13px; opacity: 0.85; margin-top: 6px;">Staff Account Onboarding</div>
    </div>
    <div class="body">
      <p>Hello <strong>${staffName}</strong>,</p>
      <p class="notice">
        You have been granted <strong>${role}</strong> access to the <strong>${institutionName || 'AlphaXync Operations'}</strong> management system.
      </p>

      <div class="credentials">
        <div class="cred-row"><span class="cred-label">Login Email:</span> <span class="cred-val">${to}</span></div>
        <div class="cred-row"><span class="cred-label">Assigned Role:</span> <span class="cred-val">${role}</span></div>
        ${tempPassword ? `<div class="cred-row"><span class="cred-label">Temporary Pass:</span> <span class="cred-val">${tempPassword}</span></div>` : ''}
      </div>

      <p class="notice">
        🔒 <strong>First-Time Login Security:</strong> When you log in for the first time, a 6-digit verification code will be sent to this email to verify and activate your session.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    return this.sendEmail({
      to,
      subject: `Welcome to AlphaXync — Your Staff Account Details (${role})`,
      html
    });
  }
}

export const resendService = new ResendEmailService();
