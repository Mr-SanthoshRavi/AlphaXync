import mongoose from 'mongoose';
import { Student } from './src/models/Student';
import { FeeRule } from './src/models/FeeRule';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow');
  
  const rules = await FeeRule.find({});
  console.log('RULES:', JSON.stringify(rules, null, 2));

  const students = await Student.find({}).limit(5);
  console.log('STUDENTS rawSourceData:');
  students.forEach(s => console.log(s.registerNumber, s.rawSourceData));

  await mongoose.disconnect();
}
run();
