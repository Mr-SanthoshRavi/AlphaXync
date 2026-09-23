import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { renderTemplate, extractTemplateVariables } from '../integrations/whatsapp/templateEngine';
import { Institution } from '../models/Institution';
import { Student } from '../models/Student';
import { Message } from '../models/Message';
import { Ticket } from '../models/Ticket';
import { env } from '../config/env';

describe('Phase 2E: WhatsApp Integration & Webhook Tests', () => {
  let app: ReturnType<typeof createApp>;
  let institutionId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase();
    app = createApp();

    await Institution.deleteMany({});
    await Student.deleteMany({});
    await Message.deleteMany({});
    await Ticket.deleteMany({});

    const inst = await Institution.create({
      name: 'Engineering College',
      code: 'ENGCOL'
    });
    institutionId = inst._id as mongoose.Types.ObjectId;

    await Student.create({
      institutionId,
      academicYear: '2026-27',
      externalStudentId: 'REG-5001',
      name: 'Karthik Raja',
      whatsappNumber: '+919876543210',
      status: 'ACTIVE'
    });
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('Template Engine', () => {
    it('replaces tokens accurately and removes unresolved tokens safely', () => {
      const template = 'Dear {{student_name}}, your balance of ₹{{balance}} is due on {{due_date}}. Notes: {{missing_token}}';
      const rendered = renderTemplate(template, {
        student_name: 'Karthik Raja',
        balance: '25,000',
        due_date: '31-Oct-2026'
      });

      expect(rendered).toBe('Dear Karthik Raja, your balance of ₹25,000 is due on 31-Oct-2026. Notes:');
    });

    it('extracts variable names from template', () => {
      const template = 'Hello {{student_name}}, parent {{father_name}} from {{college_name}}';
      const vars = extractTemplateVariables(template);
      expect(vars).toEqual(['student_name', 'father_name', 'college_name']);
    });
  });

  describe('WhatsApp Meta Webhook Verification', () => {
    it('GET /webhooks/whatsapp verifies subscription with correct token', async () => {
      const res = await request(app).get('/webhooks/whatsapp').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': env.WHATSAPP_VERIFY_TOKEN,
        'hub.challenge': 'CHALLENGE_CODE_12345'
      });

      expect(res.status).toBe(200);
      expect(res.text).toBe('CHALLENGE_CODE_12345');
    });

    it('GET /webhooks/whatsapp rejects unauthorized verify token with 403', async () => {
      const res = await request(app).get('/webhooks/whatsapp').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'CHALLENGE_CODE_12345'
      });

      expect(res.status).toBe(403);
    });
  });

  describe('WhatsApp Delivery Status Updates', () => {
    it('POST /webhooks/whatsapp updates message status to DELIVERED and READ', async () => {
      const msg = await Message.create({
        institutionId,
        recipient: '+919876543210',
        templateName: 'fee_reminder',
        providerMessageId: 'wamid.HBgLMTIzNDU2Nzg5MA==',
        status: 'SENT',
        idempotencyKey: 'test_wamid_msg_01'
      });

      // 1. Simulate DELIVERED webhook
      const deliveredPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.HBgLMTIzNDU2Nzg5MA==',
                      status: 'delivered',
                      timestamp: '1789999000'
                    }
                  ]
                }
              }
            ]
          }
        ]
      };

      const res1 = await request(app).post('/webhooks/whatsapp').send(deliveredPayload);
      expect(res1.status).toBe(200);

      const msgDelivered = await Message.findById(msg._id);
      expect(msgDelivered!.status).toBe('DELIVERED');
      expect(msgDelivered!.deliveredAt).toBeDefined();

      // 2. Simulate READ webhook
      const readPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.HBgLMTIzNDU2Nzg5MA==',
                      status: 'read',
                      timestamp: '1789999100'
                    }
                  ]
                }
              }
            ]
          }
        ]
      };

      const res2 = await request(app).post('/webhooks/whatsapp').send(readPayload);
      expect(res2.status).toBe(200);

      const msgRead = await Message.findById(msg._id);
      expect(msgRead!.status).toBe('READ');
      expect(msgRead!.readAt).toBeDefined();
    });
  });

  describe('Inbound WhatsApp Message -> Helpdesk Ticket', () => {
    it('POST /webhooks/whatsapp creates ticket for incoming message from student', async () => {
      const inboundPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: '919876543210',
                      text: { body: 'When is the last date to submit semester exam fee?' }
                    }
                  ]
                }
              }
            ]
          }
        ]
      };

      const res = await request(app).post('/webhooks/whatsapp').send(inboundPayload);
      expect(res.status).toBe(200);

      const ticket = await Ticket.findOne({ phone: '+919876543210' });
      expect(ticket).toBeDefined();
      expect(ticket!.message).toBe('When is the last date to submit semester exam fee?');
      expect(ticket!.senderName).toBe('Karthik Raja');
      expect(ticket!.status).toBe('OPEN');
    });
  });
});
