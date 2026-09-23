require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const msg = await db.collection('messages').findOne({ recipient: '+919876543210' });
    console.log('SKIPPED MSG DETAILS:', JSON.stringify(msg, null, 2));

    const allJobs = await db.collection('jobs').find().toArray();
    console.log('JOBS COUNT:', allJobs.length);
    allJobs.forEach(j => console.log(j.type, j.status, j.payload));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
test();
