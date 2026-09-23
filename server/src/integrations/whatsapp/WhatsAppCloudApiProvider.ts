import { WhatsAppProvider, SendMessageOptions, SendMessageResult } from './WhatsAppProvider';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export class WhatsAppCloudApiProvider implements WhatsAppProvider {
  providerName = 'whatsapp_cloud_api';
  private phoneNumberId: string;
  private accessToken: string;
  private apiVersion: string;

  constructor() {
    this.phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = env.WHATSAPP_ACCESS_TOKEN;
    this.apiVersion = env.WHATSAPP_API_VERSION || 'v20.0';
  }

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    const { recipient, body, templateName, variables } = options;
    const cleanPhone = recipient.replace('+', '');

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
      
      let payload: any;
      if (templateName) {
        payload = {
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: variables
              ? [
                  {
                    type: 'body',
                    parameters: Object.values(variables).map((text) => ({ type: 'text', text }))
                  }
                ]
              : []
          }
        };
      } else {
        payload = {
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { body: body || '' }
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data: any = await res.json();

      if (!res.ok) {
        logger.error('WHATSAPP_CLOUD_API_ERROR', 'Meta WhatsApp API returned error', data as Record<string, unknown>);
        return {
          success: false,
          status: 'FAILED',
          error: data?.error?.message || 'Meta API error'
        };
      }

      const providerMessageId = data?.messages && data.messages[0] ? data.messages[0].id : undefined;

      return {
        success: true,
        status: 'SENT',
        providerMessageId
      };
    } catch (error: any) {
      logger.error('WHATSAPP_CLOUD_NETWORK_ERROR', error.message);
      throw error; // Rethrow to trigger exponential backoff in job queue
    }
  }

  async validateRecipient(phoneNumber: string): Promise<boolean> {
    return phoneNumber.length >= 10;
  }
}
