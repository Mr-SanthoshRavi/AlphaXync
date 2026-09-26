import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Institution } from '../models/Institution';
import { User } from '../models/User';
import { Student } from '../models/Student';
import { DataConnection } from '../models/DataConnection';
import { signAccessToken } from '../middleware/auth';

describe('Multi-Tenant Account Isolation & No-Merge Security', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('guarantees complete isolation between two separate accounts', async () => {
    // 1. Create Account A (e.g. Sridevi Arts College Admin)
    const instA = await Institution.create({
      name: 'SRIDEVI ARTS AND SCIENCE COLLEGE',
      code: 'SRIDEVI',
      timezone: 'Asia/Kolkata',
      active: true
    });

    const userA = await User.create({
      institutionId: instA._id,
      name: 'Admin Ravi',
      email: 'ravid19983@gmail.com',
      passwordHash: 'hashed_password_a',
      role: 'ADMIN',
      isActive: true,
      isEmailVerified: true
    });

    // Add students to Institution A
    await Student.create([
      {
        institutionId: instA._id,
        externalStudentId: 'ST2026-1001',
        name: 'Arun Kumar',
        whatsappNumber: '+919876543210',
        course: 'B.Sc Computer Science',
        year: '1st Year',
        academicYear: '2026-2027',
        status: 'ACTIVE'
      },
      {
        institutionId: instA._id,
        externalStudentId: 'ST2026-1002',
        name: 'Priya S',
        whatsappNumber: '+919876543211',
        course: 'B.Sc Computer Science',
        year: '1st Year',
        academicYear: '2026-2027',
        status: 'ACTIVE'
      }
    ]);

    // DataConnection for Institution A
    await DataConnection.create({
      institutionId: instA._id,
      provider: 'google_sheets',
      accountReference: 'ravid19983@gmail.com',
      status: 'CONNECTED',
      sheetReference: 'Students_Master',
      syncInterval: 60
    });

    // 2. Create Account B (e.g. Alpha Prime)
    const instB = await Institution.create({
      name: 'ALPHA PRIME Operations',
      code: 'ALPHAPRIME',
      timezone: 'Asia/Kolkata',
      active: true
    });

    const userB = await User.create({
      institutionId: instB._id,
      name: 'Alpha Prime Admin',
      email: 'alphaprime.co.in@gmail.com',
      passwordHash: 'hashed_password_b',
      role: 'ADMIN',
      isActive: true,
      isEmailVerified: true
    });

    const tokenA = signAccessToken({
      userId: userA._id.toString(),
      institutionId: instA._id.toString(),
      role: 'ADMIN',
      email: userA.email
    });

    const tokenB = signAccessToken({
      userId: userB._id.toString(),
      institutionId: instB._id.toString(),
      role: 'ADMIN',
      email: userB.email
    });

    // 3. User A queries /api/students -> should see 2 students
    const resA = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(resA.status).toBe(200);
    expect(resA.body.data.students).toHaveLength(2);
    expect(resA.body.data.students[0].name).toBe('Arun Kumar');

    // 4. User B queries /api/students -> MUST NOT SEE USER A'S STUDENTS (should see 0)
    const resB = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.data.students).toHaveLength(0);

    // 5. User A checks /api/settings -> institution should be SRIDEVI
    const setA = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(setA.status).toBe(200);
    expect(setA.body.data.institution.code).toBe('SRIDEVI');
    expect(setA.body.data.institution.name).toBe('SRIDEVI ARTS AND SCIENCE COLLEGE');

    // 6. User B checks /api/settings -> institution should be ALPHAPRIME, NOT SRIDEVI
    const setB = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(setB.status).toBe(200);
    expect(setB.body.data.institution.code).toBe('ALPHAPRIME');
    expect(setB.body.data.institution.name).toBe('ALPHA PRIME Operations');

    // 7. Verify /api/auth/me returns isolated profile
    const meA = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenA}`);

    const meB = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(meA.body.data.institution.id).not.toBe(meB.body.data.institution.id);
    expect(meA.body.data.user.email).toBe('ravid19983@gmail.com');
    expect(meB.body.data.user.email).toBe('alphaprime.co.in@gmail.com');
  });
});
