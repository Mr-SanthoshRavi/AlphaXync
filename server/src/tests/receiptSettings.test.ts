import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../app';
import { Institution } from '../models/Institution';
import { User } from '../models/User';
import { env } from '../config/env';

const app = createApp();

describe('Receipt Customizer & Settings Persistence', () => {
  let adminToken: string;
  let institutionId: string;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }

    const testCode = `TEST_INST_${Date.now()}`;
    const institution = await Institution.create({
      name: 'Test Academy for Arts & Science',
      code: testCode
    });
    institutionId = institution._id.toString();

    const user = await User.create({
      institutionId: institution._id,
      name: 'Admin Test',
      email: `admin_${Date.now()}@testacademy.edu`,
      passwordHash: 'dummy_hash',
      role: 'ADMIN'
    });

    const { signAccessToken } = await import('../middleware/auth');
    adminToken = signAccessToken({
      userId: user._id.toString(),
      institutionId,
      role: 'ADMIN',
      email: user.email
    });
  });

  afterAll(async () => {
    if (institutionId) {
      await Institution.findByIdAndDelete(institutionId);
      await User.deleteMany({ institutionId });
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('GET /api/settings returns default receiptSettings for institution', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.institution.receiptSettings).toBeDefined();
    expect(res.body.data.institution.receiptSettings.headerTitleSize).toBe(20);
    expect(res.body.data.institution.receiptSettings.showWatermark).toBe(true);
    expect(res.body.data.institution.receiptSettings.watermarkSize).toBe(280);
  });

  it('PUT /api/settings/institution updates receiptSettings and persists customizations', async () => {
    const updatePayload = {
      receiptSettings: {
        headerTitleSize: 26,
        headerTitleColor: '#1e3a8a',
        headerLogoSize: 52,
        headerLogoPosition: 'stacked',
        showWatermark: true,
        watermarkSize: 320,
        watermarkOpacity: 0.15,
        watermarkRotation: -15,
        watermarkGrayscale: false,
        primaryColor: '#065f46',
        bodyFontSize: 13,
        signatoryLabel: 'Accounts Controller'
      }
    };

    const updateRes = await request(app)
      .put('/api/settings/institution')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(updatePayload);

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.data.receiptSettings.headerTitleSize).toBe(26);
    expect(updateRes.body.data.receiptSettings.headerTitleColor).toBe('#1e3a8a');
    expect(updateRes.body.data.receiptSettings.headerLogoPosition).toBe('stacked');
    expect(updateRes.body.data.receiptSettings.primaryColor).toBe('#065f46');
    expect(updateRes.body.data.receiptSettings.signatoryLabel).toBe('Accounts Controller');

    // Verify GET /api/auth/me also returns updated receiptSettings
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.institution.receiptSettings.headerTitleSize).toBe(26);
    expect(meRes.body.data.institution.receiptSettings.signatoryLabel).toBe('Accounts Controller');
  });
});
