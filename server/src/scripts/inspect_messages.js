require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const students = await db.collection('students').find().toArray();
    console.log('STUDENTS IN DB:');
    students.forEach(s => console.log(`${s.externalStudentId} | ${s.name} | phone: "${s.whatsappNumber}"`));
    
    const messages = await db.collection('messages').find().toArray();
    console.log('\nMESSAGES IN DB (' + messages.length + '):');
    messages.forEach(m => console.log(`${m.recipient} | ${m.status} | ${m.templateName} | studentId: ${m.studentId} | createdAt: ${m.createdAt}`));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
test();
