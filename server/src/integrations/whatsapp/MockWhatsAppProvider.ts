import { WhatsAppProvider, SendMessageOptions, SendMessageResult } from './WhatsAppProvider';
import { logger } from '../../utils/logger';

export class MockWhatsAppProvider implements WhatsAppProvider {
  providerName = 'whatsapp_mock';
  public sentMessages: Array<SendMessageOptions & { providerMessageId: string; timestamp: Date }> = [];

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    const { recipient, body, templateName, idempotencyKey } = options;

    // Simulate invalid phone failure
    if (!recipient || recipient.length < 10) {
      return {
        success: false,
        status: 'FAILED',
        error: 'Invalid recipient phone number format'
      };
    }

    const providerMessageId = `wamid.mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.sentMessages.push({
      ...options,
      providerMessageId,
      timestamp: new Date()
    });

    logger.info('MOCK_WHATSAPP_SENT', `Simulated send to ${recipient}`, {
      providerMessageId,
      templateName,
      idempotencyKey
    });

    return {
      success: true,
      status: 'SENT',
      providerMessageId
    };
  }

  async validateRecipient(phoneNumber: string): Promise<boolean> {
    return phoneNumber.startsWith('+91') && phoneNumber.length === 13;
  }
}
