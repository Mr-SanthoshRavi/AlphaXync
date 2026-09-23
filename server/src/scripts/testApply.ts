import mongoose from 'mongoose';
import { Student } from '../models/Student';
import { FeeRule } from '../models/FeeRule';
import { FeeAccount } from '../models/FeeAccount';
import { applyAllActiveRules } from '../modules/fees/feeRuleEngine';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow');
  
  const rules = await FeeRule.find({});
  if (rules.length > 0) {
    const institutionId = rules[0].institutionId;
    console.log(`Applying rules for institution: ${institutionId}`);
    
    // First, verify matching students directly
    const students = await Student.find({
      institutionId,
      status: 'ACTIVE',
      'rawSourceData.Course': 'BSC CS',
      'rawSourceData.Year': 'II'
    });
    console.log(`Found ${students.length} students matching Course=BSC CS, Year=II`);
    
    // Let's modify the rule to match Year=II so we can see if it works
    const rule = rules[0];
    rule.criteria = [
      { field: 'Course', value: 'BSC CS' },
      { field: 'Year', value: 'II' }
    ];
    rule.amount = 2500;
    await rule.save();
    console.log(`Rule updated to match Course=BSC CS and Year=II, amount: 2500`);

    const updated = await applyAllActiveRules(institutionId);
    console.log(`applyAllActiveRules returned: ${updated} accounts updated`);
    
    // Now verify the accounts
    const accounts = await FeeAccount.find({ institutionId, studentId: { $in: students.map(s => s._id) } });
    console.log(`Verified accounts:`);
    accounts.forEach(a => console.log(`${a.studentId} - Total: ${a.totalAmount}, Balance: ${a.balance}`));

  }

  await mongoose.disconnect();
}
run();
