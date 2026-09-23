require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const messages = await db.collection('messages').find().toArray();
    console.log('MESSAGES:');
    for (const m of messages) {
      const student = await db.collection('students').findOne({ _id: m.studentId });
      console.log(`ID: ${m._id} | Recipient in msg: ${m.recipient} | Student: ${student?.name} (${student?.externalStudentId}) | Student current phone in DB: "${student?.whatsappNumber}" | Status: ${m.status} | Template: ${m.templateName} | Failure: ${m.failureReason}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
test();
