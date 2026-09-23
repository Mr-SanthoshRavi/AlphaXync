require('dotenv').config();
const mongoose = require('mongoose');

async function clean() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Delete any message with dummy test number or mismatched failure reason
    const result = await db.collection('messages').deleteMany({
      $or: [
        { recipient: '+919876543210' },
        { recipient: '9876543210' },
        { failureReason: 'RECIPIENT_MISMATCH_WITH_SOURCE_SHEET' }
      ]
    });

    console.log(`Deleted ${result.deletedCount} fake/mismatched messages.`);

    // Also check jobs collection for any queued/skipped jobs with dummy test number
    const jobResult = await db.collection('jobs').deleteMany({
      $or: [
        { 'payload.recipient': '+919876543210' },
        { 'payload.recipient': '9876543210' },
        { lastError: 'RECIPIENT_MISMATCH_WITH_SOURCE_SHEET' }
      ]
    });
    console.log(`Deleted ${jobResult.deletedCount} fake/mismatched jobs.`);

    // Verify remaining messages
    const remaining = await db.collection('messages').find().toArray();
    console.log(`\nRemaining messages in DB (${remaining.length}):`);
    for (const m of remaining) {
      const student = await db.collection('students').findOne({ _id: m.studentId });
      console.log(`- Recipient: ${m.recipient} | Student: ${student?.name} (${student?.externalStudentId}) | Status: ${m.status} | Template: ${m.templateName}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
clean();
