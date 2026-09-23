import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';

dotenv.config();

async function resetPasswords() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);

  const newPassword = 'AdminPassword123!';
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update admin user
  const adminRes = await User.updateOne(
    { email: 'admin@stxavier.edu' },
    {
      passwordHash: hashedPassword,
      failedLoginAttempts: 0,
      lockoutUntil: null
    }
  );
  console.log('Admin user updated:', adminRes);

  // Update cashier user
  const cashierRes = await User.updateOne(
    { email: 'cashier@stxavier.edu' },
    {
      passwordHash: hashedPassword,
      failedLoginAttempts: 0,
      lockoutUntil: null
    }
  );
  console.log('Cashier user updated:', cashierRes);

  console.log('\n SUCCESS! Passwords reset to:', newPassword);
  console.log('Credentials:');
  console.log('  Admin:   admin@stxavier.edu   / AdminPassword123!');
  console.log('  Cashier: cashier@stxavier.edu / AdminPassword123!\n');

  await mongoose.disconnect();
}

resetPasswords().catch((err) => {
  console.error('Failed to reset passwords:', err);
  process.exit(1);
});
