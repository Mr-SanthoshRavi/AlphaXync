const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB Atlas');

  // 1. Delete mock data connections
  const dConns = await mongoose.connection.collection('dataconnections').deleteMany({
    $or: [
      { accountReference: { $regex: /mock/i } },
      { accountReference: 'mock_google_sheets@institution.edu' }
    ]
  });
  console.log('Deleted mock DataConnections:', dConns.deletedCount);

  // 2. Delete mock students (all generated students starting with ST2026- or mock names)
  const dStudents = await mongoose.connection.collection('students').deleteMany({
    $or: [
      { externalStudentId: { $regex: /^ST2026-/i } },
      { name: { $in: ['Arun Kumar', 'Kavitha Kumar', 'Vijay Kumar', 'Priya Kumar', 'Deepak Kumar'] } }
    ]
  });
  console.log('Deleted mock Students:', dStudents.deletedCount);

  // 3. Delete orphaned fee accounts
  const dFees = await mongoose.connection.collection('feeaccounts').deleteMany({});
  console.log('Purged FeeAccounts:', dFees.deletedCount);

  // 4. Delete orphaned sync conflicts
  const dConflicts = await mongoose.connection.collection('syncconflicts').deleteMany({});
  console.log('Purged SyncConflicts:', dConflicts.deletedCount);

  const remainingStudents = await mongoose.connection.collection('students').countDocuments();
  const remainingConns = await mongoose.connection.collection('dataconnections').countDocuments();
  console.log('Remaining students in DB:', remainingStudents);
  console.log('Remaining connections in DB:', remainingConns);

  await mongoose.disconnect();
  console.log('Done!');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
