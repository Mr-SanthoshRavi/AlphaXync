import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { User } from '../models/User';
import { signAccessToken } from '../middleware/auth';

async function checkApiEndpoints() {
  await mongoose.connect(process.env.MONGODB_URI!);

  const admin = await User.findOne({ email: 'admin@stxavier.edu' });
  if (!admin) throw new Error('Admin user not found');

  const token = signAccessToken({
    userId: admin._id.toString(),
    institutionId: admin.institutionId.toString(),
    role: admin.role,
    email: admin.email
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };

  const BASE_URL = 'http://localhost:5000/api';

  console.log('>>> [1] Fetching Dashboard Summary...');
  const dashRes = await fetch(`${BASE_URL}/dashboard/summary`, { headers }).then(r => r.json() as Promise<any>);
  console.log('Dashboard Summary:', JSON.stringify(dashRes.data.cards, null, 2));
  console.log('Needs Attention:', JSON.stringify(dashRes.data.needsAttention, null, 2));

  console.log('\n>>> [2] Fetching Students Directory...');
  const studentsRes = await fetch(`${BASE_URL}/students?limit=25`, { headers }).then(r => r.json() as Promise<any>);
  console.log(`Total students in directory: ${studentsRes.data.pagination.total}`);
  studentsRes.data.students.forEach((s: any) => {
    console.log(`- ${s.externalStudentId}: ${s.name} | Phone: "${s.whatsappNumber}" | Fee: ₹${s.fee?.totalAmount || 0} | Status: ${s.validationStatus}`);
  });

  console.log('\n>>> [3] Fetching Message Stats...');
  const messageStats = await fetch(`${BASE_URL}/messages/stats`, { headers }).then(r => r.json() as Promise<any>);
  console.log('Message Stats:', JSON.stringify(messageStats.data, null, 2));

  await mongoose.disconnect();
}

checkApiEndpoints().catch(console.error);
