import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { findMatchingStudents } from '../modules/fees/feeRuleEngine';
import { Student } from '../models/Student';
import { FeeRule } from '../models/FeeRule';

async function test() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow');
  console.log('Connected to MongoDB');

  const student = await Student.findOne({});
  if (!student) {
    console.error('No students found!');
    process.exit(1);
  }

  const institutionId = student.institutionId;

  console.log('\n--- TEST 1: Exact Match (Course = BSC CS, Year = II) ---');
  const match1 = await findMatchingStudents(institutionId, [
    { field: 'Course', value: 'BSC CS' },
    { field: 'Year', value: 'II' }
  ]);
  console.log(`Matched ${match1.length} students:`, match1.map(s => `${s.name} (${s.externalStudentId}, Year ${s.year})`));

  console.log('\n--- TEST 2: Dirty Data / Case & Whitespace Tolerant (course = "  bsc cs  ", year = "  ii  ") ---');
  const match2 = await findMatchingStudents(institutionId, [
    { field: ' course ', value: '  bsc cs  ' },
    { field: ' year ', value: '  ii  ' }
  ]);
  console.log(`Matched ${match2.length} students:`, match2.map(s => `${s.name} (${s.externalStudentId}, Year ${s.year})`));

  console.log('\n--- TEST 3: Arabic Number vs Roman Numeral (year = "2") ---');
  const match3 = await findMatchingStudents(institutionId, [
    { field: 'Course', value: 'BSC CS' },
    { field: 'Year', value: '2' }
  ]);
  console.log(`Matched ${match3.length} students:`, match3.map(s => `${s.name} (${s.externalStudentId}, Year ${s.year})`));

  console.log('\n--- TEST 4: User Combination (Department = Computer Science, Course = BSC CS, Year = I) ---');
  const match4 = await findMatchingStudents(institutionId, [
    { field: 'Department', value: 'Computer Science' },
    { field: 'Course', value: 'BSC CS' },
    { field: 'Year', value: 'I' }
  ]);
  console.log(`Matched ${match4.length} students (Expected 0 because all CS BSC CS students are in Year II):`, match4.map(s => s.name));

  console.log('\n--- TEST 5: Department = Computer Science (All years & courses) ---');
  const match5 = await findMatchingStudents(institutionId, [
    { field: 'Department', value: 'computer science' }
  ]);
  console.log(`Matched ${match5.length} students:`, match5.map(s => `${s.name} (${s.course}, Yr ${s.year})`));

  await mongoose.disconnect();
  console.log('\nVerification complete!');
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
