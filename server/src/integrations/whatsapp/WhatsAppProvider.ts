export interface SendMessageOptions {
  recipient: string;
  templateName?: string;
  body?: string;
  variables?: Record<string, string>;
  idempotencyKey?: string;
  mediaUrl?: string;
}

export interface SendMessageResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  status: 'SENT' | 'FAILED';
}

export interface WhatsAppProvider {
  providerName: string;
  sendMessage(options: SendMessageOptions): Promise<SendMessageResult>;
  validateRecipient(phoneNumber: string): Promise<boolean>;
}
