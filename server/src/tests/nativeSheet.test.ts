import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app';
import { Institution } from '../models/Institution';
import { User } from '../models/User';
import { Student } from '../models/Student';
import { FeeAccount } from '../models/FeeAccount';
import { signAccessToken } from '../middleware/auth';

describe('AlphaSheet Studio & Native Sheet Endpoints', () => {
  let mongoServer: MongoMemoryServer;
  let app: any;
  let institutionId: mongoose.Types.ObjectId;
  let adminToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    app = createApp();

    const institution = await Institution.create({
      name: "St. Xavier's Engineering College",
      code: 'STXAVIER'
    });
    institutionId = institution._id as mongoose.Types.ObjectId;

    const adminUser = await User.create({
      institutionId,
      name: 'Admin Test',
      email: 'admin@stxavier.edu',
      passwordHash: 'hash',
      role: 'ADMIN'
    });

    adminToken = signAccessToken({
      userId: adminUser._id.toString(),
      institutionId: institutionId.toString(),
      role: 'ADMIN',
      email: adminUser.email
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  let createdStudentId: string;

  it('POST /api/students creates a native sheet student and fee ledger', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        externalStudentId: '26CSE101',
        name: 'Santhosh Native',
        fatherName: 'Ravi M',
        whatsappNumber: '9876543210',
        course: 'B.Tech',
        department: 'Computer Science (CSE)',
        year: '1',
        section: 'A',
        totalFee: 75000,
        paidAmount: 0
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.student.name).toBe('Santhosh Native');
    expect(res.body.data.student.whatsappNumber).toBe('+919876543210');
    expect(res.body.data.student.sourceProvider).toBe('native_sheet');
    expect(res.body.data.student.fee.total).toBe(75000);
    expect(res.body.data.student.fee.balance).toBe(75000);

    createdStudentId = res.body.data.student.id;
  });

  it('POST /api/students rejects duplicate roll number with 409', async () => {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        externalStudentId: '26CSE101',
        name: 'Duplicate Student'
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('PUT /api/students/:id updates student info and recalculates fee ledger', async () => {
    const res = await request(app)
      .put(`/api/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Santhosh Ravi Updated',
        totalFee: 80000
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.student.name).toBe('Santhosh Ravi Updated');
    expect(res.body.data.student.fee.total).toBe(80000);
    expect(res.body.data.student.fee.balance).toBe(80000);
  });

  it('POST /api/students/batch-save updates multiple student records simultaneously', async () => {
    const res = await request(app)
      .post('/api/students/batch-save')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        updates: [
          {
            id: createdStudentId,
            section: 'B',
            year: '2'
          }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updatedCount).toBe(1);

    const check = await Student.findById(createdStudentId);
    expect(check?.section).toBe('B');
    expect(check?.year).toBe('2');
  });

  it('POST /api/students/bulk-import imports multiple rows and creates ledger accounts', async () => {
    const res = await request(app)
      .post('/api/students/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rows: [
          {
            'Roll No': '26IT101',
            'Student Name': 'Ananya Sharma',
            'WhatsApp Number': '9876543211',
            'Course': 'B.Tech',
            'Department': 'Information Technology (IT)',
            'Total Fee': 65000
          },
          {
            'Roll No': '26MECH101',
            'Student Name': 'Karthik Raja',
            'WhatsApp Number': '9876543212',
            'Course': 'B.Tech',
            'Department': 'Mechanical Engineering (MECH)',
            'Total Fee': 60000
          }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.added).toBe(2);

    const imported = await Student.findOne({ externalStudentId: '26IT101' });
    expect(imported).toBeDefined();
    expect(imported?.sourceProvider).toBe('excel_import');
  });

  it('GET /api/students/export downloads an Excel spreadsheet buffer', async () => {
    const res = await request(app)
      .get('/api/students/export?format=xlsx')
      .set('Authorization', `Bearer ${adminToken}`)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c) => chunks.push(Buffer.from(c)));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('attachment; filename=');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(100);
  });

  it('GET /api/students/template downloads blank Excel import template', async () => {
    const res = await request(app)
      .get('/api/students/template?format=xlsx')
      .set('Authorization', `Bearer ${adminToken}`)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c) => chunks.push(Buffer.from(c)));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('AlphaSheet_Import_Template.xlsx');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(100);
  });

  it('DELETE /api/students/:id permanently removes native student and fee account', async () => {
    const res = await request(app)
      .delete(`/api/students/${createdStudentId}?permanent=true`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const checkStudent = await Student.findById(createdStudentId);
    expect(checkStudent).toBeNull();

    const checkFee = await FeeAccount.findOne({ studentId: createdStudentId });
    expect(checkFee).toBeNull();
  });
});
