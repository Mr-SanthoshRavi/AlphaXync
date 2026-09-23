import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { encrypt, decrypt, verifyHmacSignature, calculateHash } from '../utils/crypto';
import { Institution } from '../models/Institution';
import { User } from '../models/User';
import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';

describe('Phase 2A: Backend Foundation & Infrastructure Tests', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('Health and Readiness Probes', () => {
    it('GET /health returns healthy status and connected database', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.database).toBe('connected');
    });

    it('GET /ready returns 200 ready: true when DB connected', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(true);
    });
  });

  describe('Crypto & Security Utilities', () => {
    it('encrypts and decrypts sensitive values without data loss', () => {
      const secret = 'rzp_live_super_sensitive_api_secret_key_99999';
      const encrypted = encrypt(secret);
      expect(encrypted).not.toBe(secret);
      expect(encrypted.split(':')).toHaveLength(3); // iv:authTag:encrypted

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('validates HMAC signatures correctly for webhooks', () => {
      const payload = JSON.stringify({ event: 'payment.captured', amount: 50000 });
      const secret = 'wh_secret_abc123';
      const crypto = require('crypto');
      const validSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      expect(verifyHmacSignature(payload, validSig, secret)).toBe(true);
      expect(verifyHmacSignature(payload, 'invalid_sig_12345', secret)).toBe(false);
    });

    it('calculates deterministic source hashes for diff detection', () => {
      const rowA = { name: 'Arun Kumar', fee: 20000, course: 'BCA' };
      const rowB = { name: 'Arun Kumar', fee: 20000, course: 'BCA' };
      const rowC = { name: 'Arun Kumar', fee: 25000, course: 'BCA' };

      expect(calculateHash(rowA)).toBe(calculateHash(rowB));
      expect(calculateHash(rowA)).not.toBe(calculateHash(rowC));
    });
  });

  describe('Auth Module & Institutional Setup Flow', () => {
    let adminToken: string;

    it('POST /api/auth/setup initializes institution and admin user', async () => {
      // Clear any prior users from test db
      await User.deleteMany({});
      await Institution.deleteMany({});

      const setupPayload = {
        institutionName: "St. Xavier's Engineering College",
        institutionCode: 'STXAVIER',
        adminName: 'Dr. S. Ramanathan',
        email: 'admin@stxavier.edu',
        password: 'AdminPassword123!'
      };

      const res = await request(app).post('/api/auth/setup').send(setupPayload);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.admin.email).toBe('admin@stxavier.edu');
      expect(res.body.data.admin.role).toBe('ADMIN');
      expect(res.body.data.institution.code).toBe('STXAVIER');
    });

    it('POST /api/auth/login rejects invalid passwords', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'admin@stxavier.edu',
        password: 'WrongPassword!'
      });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('POST /api/auth/login succeeds with correct password and returns JWT token', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'admin@stxavier.edu',
        password: 'AdminPassword123!'
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('admin@stxavier.edu');

      adminToken = res.body.data.token;
    });

    it('GET /api/auth/me returns authenticated admin user profile', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('admin@stxavier.edu');
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.institution.code).toBe('STXAVIER');
    });
  });

  describe('Model Constraints & Indexes', () => {
    it('enforces composite uniqueness on Student (institutionId + academicYear + externalStudentId)', async () => {
      const institution = await Institution.findOne({ code: 'STXAVIER' });
      expect(institution).toBeDefined();

      await Student.deleteMany({});

      const student1 = new Student({
        institutionId: institution!._id,
        academicYear: '2026-27',
        externalStudentId: 'REG-101',
        name: 'Arun Kumar',
        whatsappNumber: '+919876543210',
        course: 'BCA',
        year: '2'
      });
      await student1.save();

      const duplicateStudent = new Student({
        institutionId: institution!._id,
        academicYear: '2026-27',
        externalStudentId: 'REG-101',
        name: 'Arun Duplicate',
        whatsappNumber: '+919876543210'
      });

      await expect(duplicateStudent.save()).rejects.toThrow();
    });
  });
});
