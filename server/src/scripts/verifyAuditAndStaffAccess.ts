import mongoose from 'mongoose';
import { env } from '../config/env';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { Institution } from '../models/Institution';

async function verify() {
  console.log('Connecting to database...');
  await mongoose.connect(env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  const institution = (await Institution.findOne({ active: true })) || (await Institution.findOne());
  if (!institution) {
    throw new Error('No institution found');
  }
  console.log(`✓ Using institution: ${institution.name} (${institution._id})`);

  // 1. Test User model with shift schedule & permissions
  const testEmail = `test_cashier_${Date.now()}@alphaprime.co.in`;
  const cashier = await User.create({
    institutionId: institution._id,
    name: 'Test Shift Cashier',
    email: testEmail,
    passwordHash: 'dummy_hash',
    role: 'CASHIER',
    isActive: true,
    accessSchedule: {
      mode: 'SHIFT_WINDOW',
      shiftStart: '09:00',
      shiftEnd: '18:00'
    },
    permissions: ['COLLECT_PAYMENTS', 'RECORD_OFFLINE']
  });
  console.log(`✓ Created test cashier user with SHIFT_WINDOW schedule: ${cashier.email}`);

  // Test isAccessAllowedNow
  const accessCheck1 = cashier.isAccessAllowedNow();
  console.log(`✓ Access check during shift window: allowed = ${accessCheck1.allowed}, reason = ${accessCheck1.reason || 'None'}`);

  // Test suspension
  cashier.isActive = false;
  await cashier.save();
  const accessCheckSuspended = cashier.isAccessAllowedNow();
  console.log(`✓ Access check when suspended: allowed = ${accessCheckSuspended.allowed}, reason = "${accessCheckSuspended.reason}"`);
  if (accessCheckSuspended.allowed === true) {
    throw new Error('Suspension check failed!');
  }

  // 2. Test AuditLog creation and query
  const testAuditLog = await AuditLog.create({
    institutionId: institution._id,
    actorUserId: cashier._id,
    actorRole: 'CASHIER',
    action: 'PAYMENT_RECORDED_OFFLINE',
    entityType: 'PAYMENT',
    entityId: new mongoose.Types.ObjectId().toString(),
    before: { paidAmount: 0 },
    after: { paidAmount: 25000, receiptNumber: 'REC-TEST-9999' },
    reason: 'Test cashier offline counter fee collection',
    ipAddress: '127.0.0.1'
  });
  console.log(`✓ Created test AuditLog entry: ${testAuditLog.action} (${testAuditLog._id})`);

  // 3. Test querying audit logs with population
  const populatedLog = await AuditLog.findById(testAuditLog._id).populate('actorUserId', 'name email role');
  console.log(`✓ Populated Actor: ${(populatedLog?.actorUserId as any)?.name} (${(populatedLog?.actorUserId as any)?.email}) [${(populatedLog?.actorUserId as any)?.role}]`);
  console.log(`✓ Before state diff:`, populatedLog?.before);
  console.log(`✓ After state diff:`, populatedLog?.after);

  // Clean up test entries
  await User.findByIdAndDelete(cashier._id);
  await AuditLog.findByIdAndDelete(testAuditLog._id);
  console.log('✓ Cleaned up test data');

  console.log('\n=============================================');
  console.log('🎉 ALL AUDIT TRAIL & STAFF ACCESS TESTS PASSED!');
  console.log('=============================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
