import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  ConnectionState,
  proto,
  Browsers
} from '@whiskeysockets/baileys';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';
import { WhatsAppProvider, SendMessageOptions, SendMessageResult } from './WhatsAppProvider';
import { logger } from '../../utils/logger';
import { normalizePhoneNumber } from '../../modules/sync/validationEngine';
import { Ticket } from '../../models/Ticket';
import { Student } from '../../models/Student';
import { broadcastEvent } from '../../modules/events/eventStream';

export type WhatsAppConnectionState =
  | 'NOT_CONNECTED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'QR_REQUIRED'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'AUTHENTICATING'
  | 'AUTH_REQUIRED'
  | 'LOGGED_OUT'
  | 'ERROR';

function formatMaskedWhatsAppNumber(rawDigits: string): string {
  const clean = rawDigits.replace(/[^0-9]/g, '');
  if (clean.length >= 10) {
    const last4 = clean.slice(-4);
    const countryCode = clean.length > 10 ? `+${clean.slice(0, clean.length - 10)} ` : '+91 ';
    return `${countryCode}••••• ${last4}`;
  }
  return '••••••••';
}

export class BaileysWhatsAppProvider implements WhatsAppProvider {
  providerName = 'baileys';
  private socket: WASocket | null = null;
  private state: WhatsAppConnectionState = 'NOT_CONNECTED';
  private qrCode: string | null = null;
  private qrDataUrl: string | null = null;
  private userPhone: string | null = null;
  private maskedPhone: string | null = null;
  private lastError: string | null = null;
  private authDir: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isExplicitDisconnect = false;
  private sentMessageCache = new Map<string, proto.IMessage>();

  private cacheSentMessage(id: string, message: proto.IMessage) {
    if (this.sentMessageCache.size > 2000) {
      const firstKey = this.sentMessageCache.keys().next().value;
      if (firstKey) this.sentMessageCache.delete(firstKey);
    }
    this.sentMessageCache.set(id, message);
  }

  constructor(sessionName = 'default') {
    const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
    const baseDir = isServerless
      ? path.join('/tmp', 'data', 'baileys_auth')
      : path.resolve(process.cwd(), 'data', 'baileys_auth');
    this.authDir = path.join(baseDir, sessionName);
    try {
      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }
    } catch (e: any) {
      // In read-only or restricted environments, fallback to /tmp
      try {
        this.authDir = path.join('/tmp', 'data', 'baileys_auth', sessionName);
        if (!fs.existsSync(this.authDir)) {
          fs.mkdirSync(this.authDir, { recursive: true });
        }
      } catch (inner) {
        console.warn('Baileys: could not create auth directory:', inner);
      }
    }
  }

  hasStoredSession(): boolean {
    const credsPath = path.join(this.authDir, 'creds.json');
    return fs.existsSync(credsPath) && fs.statSync(credsPath).size > 0;
  }

  getConnectionState(): WhatsAppConnectionState {
    return this.state;
  }

  getQrCode(): string | null {
    return this.qrCode;
  }

  getQrDataUrl(): string | null {
    return this.qrDataUrl;
  }

  getMaskedPhone(): string | null {
    return this.maskedPhone;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  async initialize(): Promise<void> {
    if (this.socket) {
      return;
    }

    try {
      this.state = 'CONNECTING';
      this.lastError = null;
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) as any,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        getMessage: async (key: proto.IMessageKey): Promise<proto.IMessage | undefined> => {
          if (key.id && this.sentMessageCache.has(key.id)) {
            return this.sentMessageCache.get(key.id);
          }
          return undefined;
        }
      });

      this.socket.ev.on('creds.update', saveCreds);

      this.socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCode = qr;
          this.state = 'QR_REQUIRED';
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          } catch (err: any) {
            logger.error('QR_CONVERSION_ERROR', err.message);
          }
          logger.info('BAILEYS_QR_GENERATED', 'WhatsApp QR code ready for scanning');
          broadcastEvent('all', 'WHATSAPP_CONNECTION_UPDATE', {
            state: this.state,
            qrCode: this.qrDataUrl,
            statusText: 'Scan this QR code with the WhatsApp account you want to use.'
          });
        }

        if (connection === 'connecting') {
          if (this.state !== 'QR_REQUIRED') {
            this.state = 'CONNECTING';
          }
        } else if (connection === 'close') {
          this.qrCode = null;
          this.qrDataUrl = null;

          if (this.isExplicitDisconnect) {
            this.isExplicitDisconnect = false;
            this.reconnectAttempts = 0;
            return;
          }

          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          if (statusCode === DisconnectReason.loggedOut) {
            this.state = 'LOGGED_OUT';
            this.maskedPhone = null;
            this.userPhone = null;
            this.lastError = 'WhatsApp account needs to be linked again.';
            logger.warn('BAILEYS_LOGGED_OUT', 'WhatsApp session was logged out. New QR scan required.');
            try {
              fs.rmSync(this.authDir, { recursive: true, force: true });
              fs.mkdirSync(this.authDir, { recursive: true });
            } catch (err: any) {
              logger.error('BAILEYS_SESSION_CLEANUP_ERROR', err.message);
            }
            broadcastEvent('all', 'WHATSAPP_CONNECTION_UPDATE', {
              state: 'LOGGED_OUT',
              statusText: this.lastError
            });
          } else if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.state = 'RECONNECTING';
            this.reconnectAttempts++;
            this.lastError = 'WhatsApp disconnected. Reconnecting...';
            const backoff = Math.pow(2, this.reconnectAttempts) * 1000;
            logger.warn(
              'BAILEYS_RECONNECTING',
              `Connection dropped (${statusCode}). Reconnecting in ${backoff}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
            );
            broadcastEvent('all', 'WHATSAPP_CONNECTION_UPDATE', {
              state: 'RECONNECTING',
              statusText: this.lastError
            });
            setTimeout(() => {
              this.socket = null;
              this.initialize().catch((err) => logger.error('BAILEYS_RECONNECT_FAILED', err.message));
            }, backoff);
          } else {
            this.state = 'ERROR';
            this.lastError = 'Unable to maintain WhatsApp connection. Please try again.';
            logger.error('BAILEYS_CONNECTION_FAILED', `Max reconnect attempts reached or unrecoverable: ${statusCode}`);
            broadcastEvent('all', 'WHATSAPP_CONNECTION_UPDATE', {
              state: 'ERROR',
              statusText: this.lastError
            });
          }
        } else if (connection === 'open') {
          this.state = 'CONNECTED';
          this.qrCode = null;
          this.qrDataUrl = null;
          this.reconnectAttempts = 0;
          this.lastError = null;

          if (this.socket?.user?.id) {
            const raw = this.socket.user.id.split('@')[0].split(':')[0];
            this.userPhone = raw;
            this.maskedPhone = formatMaskedWhatsAppNumber(raw);
          }
          logger.info('BAILEYS_CONNECTED', `WhatsApp Web connection established successfully. Number: ${this.maskedPhone || 'Unknown'}`);
          broadcastEvent('all', 'WHATSAPP_CONNECTION_UPDATE', {
            state: 'CONNECTED',
            maskedPhone: this.maskedPhone,
            statusText: 'CONNECTED ✓'
          });
        }
      });

      // Handle Inbound Messages -> Complaints / Helpdesk Ticket Creation (Module 4)
      this.socket.ev.on('messages.upsert', async (msgUpdate) => {
        for (const msg of msgUpdate.messages) {
          if (msg.key?.id && msg.message) {
            this.cacheSentMessage(msg.key.id, msg.message);
          }
        }

        if (msgUpdate.type !== 'notify') return;

        for (const msg of msgUpdate.messages) {
          if (!msg.key.fromMe && msg.key.remoteJid) {
            const rawSender = msg.key.remoteJid.replace('@s.whatsapp.net', '');
            const normalizedPhone = normalizePhoneNumber(rawSender);
            const textContent =
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              '';

            if (!normalizedPhone || !textContent.trim()) continue;

            try {
              // Locate matching student by phone
              const student = await Student.findOne({ whatsappNumber: normalizedPhone });
              const institutionId = student?.institutionId;

              if (institutionId) {
                const ticket = await Ticket.create({
                  institutionId,
                  studentId: student._id,
                  phone: normalizedPhone,
                  senderName: student.name || 'Student / Parent',
                  message: textContent.trim(),
                  source: 'WHATSAPP_BAILEYS',
                  status: 'OPEN'
                });

                broadcastEvent(institutionId.toString(), 'NEW_HELP_TICKET', {
                  ticketId: ticket._id,
                  studentName: ticket.senderName,
                  message: ticket.message
                });

                logger.info(
                  'BAILEYS_TICKET_CREATED',
                  `Created Helpdesk ticket #${ticket._id} for ${normalizedPhone} (${student.name})`
                );
              }
            } catch (ticketErr: any) {
              logger.error('BAILEYS_INBOUND_TICKET_ERROR', ticketErr.message);
            }
          }
        }
      });
    } catch (err: any) {
      this.state = 'ERROR';
      this.lastError = 'Unable to generate WhatsApp QR. Please try again.';
      logger.error('BAILEYS_INIT_ERROR', `Failed to initialize Baileys provider: ${err.message}`);
      throw err;
    }
  }

  async refreshQr(): Promise<void> {
    if (this.socket) {
      try {
        this.socket.end(undefined);
      } catch (e) {}
      this.socket = null;
    }
    this.qrCode = null;
    this.qrDataUrl = null;
    this.lastError = null;
    await this.initialize();
  }

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    const { recipient, body, mediaUrl } = options;

    if (!recipient) {
      return {
        success: false,
        status: 'FAILED',
        error: 'Missing recipient phone number'
      };
    }

    let cleanPhone = recipient.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      return {
        success: false,
        status: 'FAILED',
        error: `Invalid recipient format: "${recipient}"`
      };
    }

    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }

    if (this.state !== 'CONNECTED' || !this.socket) {
      return {
        success: false,
        status: 'FAILED',
        error: `WhatsApp Web session is ${this.state}. Connect or scan QR code in Settings.`
      };
    }

    try {
      const jid = recipient.includes('@') ? recipient : `${cleanPhone}@s.whatsapp.net`;

      // Warm up Signal protocol session keys with recipient JID
      try {
        await this.socket.presenceSubscribe(jid);
        await this.socket.sendPresenceUpdate('composing', jid);
      } catch (presenceErr) {
        // Silently continue if presence update fails
      }

      let sentMessage;

      if (mediaUrl && mediaUrl.trim()) {
        sentMessage = await this.socket.sendMessage(jid, {
          image: { url: mediaUrl.trim() },
          caption: body || ''
        });
      } else {
        sentMessage = await this.socket.sendMessage(jid, { text: body || '' });
      }

      const providerMessageId = sentMessage?.key?.id ? String(sentMessage.key.id) : undefined;

      // Cache sent message proto to fulfill WhatsApp retry receipts
      // (Resolves "Waiting for this message. This may take a while")
      if (sentMessage?.key?.id && sentMessage.message) {
        this.cacheSentMessage(sentMessage.key.id, sentMessage.message);
      }

      return {
        success: true,
        status: 'SENT',
        providerMessageId
      };
    } catch (err: any) {
      logger.error('BAILEYS_SEND_ERROR', `Error sending message to ${recipient}: ${err.message}`);
      return {
        success: false,
        status: 'FAILED',
        error: err.message || 'Baileys delivery failed'
      };
    }
  }

  async validateRecipient(phoneNumber: string): Promise<boolean> {
    const normalized = normalizePhoneNumber(phoneNumber);
    return Boolean(normalized && normalized.length >= 10);
  }

  async logout(): Promise<void> {
    this.isExplicitDisconnect = true;
    if (this.socket) {
      try {
        await this.socket.logout();
      } catch (e) {}
      this.socket = null;
    }
    this.state = 'NOT_CONNECTED';
    this.qrCode = null;
    this.qrDataUrl = null;
    this.maskedPhone = null;
    this.userPhone = null;
    this.lastError = null;
    try {
      fs.rmSync(this.authDir, { recursive: true, force: true });
      fs.mkdirSync(this.authDir, { recursive: true });
    } catch (err: any) {
      logger.error('BAILEYS_LOGOUT_CLEANUP_ERROR', err.message);
    }
    broadcastEvent('all', 'WHATSAPP_CONNECTION_UPDATE', {
      state: 'NOT_CONNECTED',
      statusText: 'NOT CONNECTED'
    });
  }

  async disconnect(): Promise<void> {
    this.isExplicitDisconnect = true;
    if (this.socket) {
      try {
        this.socket.end(undefined);
      } catch (e) {}
      this.socket = null;
    }
    this.state = 'NOT_CONNECTED';
    this.qrCode = null;
    this.qrDataUrl = null;
    this.lastError = null;
    broadcastEvent('all', 'WHATSAPP_CONNECTION_UPDATE', {
      state: 'NOT_CONNECTED',
      statusText: 'NOT CONNECTED'
    });
  }
}

export const baileysWhatsAppProvider = new BaileysWhatsAppProvider('default');
export function getBaileysWhatsAppProvider(): BaileysWhatsAppProvider {
  return baileysWhatsAppProvider;
}
