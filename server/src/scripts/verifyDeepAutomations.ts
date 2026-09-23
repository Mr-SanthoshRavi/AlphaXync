import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const BASE_URL = 'http://localhost:5000/api';

async function verifyDeepAutomations() {
  console.log('====================================================');
  console.log('    DEEP AUTOMATION ENGINE COMPREHENSIVE AUDIT');
  console.log('====================================================');

  // Step 1: Admin Login
  console.log('\n[1/8] Authenticating Admin...');
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'admin@stxavier.edu',
    password: 'AdminPassword123!'
  });
  const token = loginRes.data.data.token;
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
  console.log('✓ Admin authenticated successfully.');

  // Step 2: Variable Discovery
  console.log('\n[2/8] Fetching Dynamic Variables Palette...');
  const varsRes = await axios.get(`${BASE_URL}/automations/variables`, authHeaders);
  const vars = varsRes.data.data.variables;
  console.log(`✓ Total Discovered Variables: ${vars.length}`);
  const categories = Array.from(new Set(vars.map((v: any) => v.category)));
  console.log(`✓ Categories: ${categories.join(', ')}`);

  // Step 3: Live Preview Simulation
  console.log('\n[3/8] Testing Live Template Preview...');
  const templateToTest = 'Hello {{student_name}} 👋\nWelcome to {{college_name}}.\nDear Parent: {{father_name}}\nCourse: {{course}}, Year: {{year}}.\nPrescribed Fee: {{total_fee}}, Remaining Balance: {{balance}}.\nPay Online: {{payment_link}}';
  const previewRes = await axios.post(
    `${BASE_URL}/automations/preview`,
    { template: templateToTest },
    authHeaders
  );
  console.log('✓ Preview generated:');
  console.log('----------------------------------------------------');
  console.log(previewRes.data.data.rendered);
  console.log('----------------------------------------------------');

  // Step 4: Create Targeted Custom Campaign
  console.log('\n[4/8] Creating Targeted Custom Campaign...');
  const createRes = await axios.post(
    `${BASE_URL}/automations/custom`,
    {
      name: 'Fee Clearance Drive 2026',
      description: 'Automated notice to students with pending balances',
      template: templateToTest,
      audience: {
        target: 'CRITERIA',
        criteria: [{ field: 'Course', operator: 'EQUALS', value: 'BSC' }]
      },
      schedule: {
        triggerType: 'MANUAL',
        maxExecutions: 1
      },
      enabled: true
    },
    authHeaders
  );
  const campaign = createRes.data.data;
  console.log(`✓ Campaign created: "${campaign.name}" [ID: ${campaign._id}]`);

  // Step 5: Verify Listing on Dashboard
  console.log('\n[5/8] Verifying Automations Dashboard Listing...');
  const listRes = await axios.get(`${BASE_URL}/automations`, authHeaders);
  const allList = listRes.data.data;
  const foundCampaign = allList.find((a: any) => a.id === campaign._id);
  if (!foundCampaign) {
    throw new Error('Created campaign not found in dashboard automations list!');
  }
  console.log(`✓ Campaign visible on dashboard. Targeted Recipients: ${foundCampaign.eligibleCount}`);

  // Step 6: Trigger Single Campaign On-Demand
  console.log('\n[6/8] Testing Single-Campaign Trigger (/trigger-single)...');
  const triggerRes = await axios.post(
    `${BASE_URL}/automations/${campaign._id}/trigger-single`,
    {},
    authHeaders
  );
  console.log(`✓ Trigger response: ${JSON.stringify(triggerRes.data.message)}`);

  // Step 7: Update Campaign
  console.log('\n[7/8] Testing Update Campaign...');
  const updateRes = await axios.put(
    `${BASE_URL}/automations/custom/${campaign._id}`,
    {
      name: 'Fee Clearance Drive 2026 (Updated)',
      description: 'Updated description for audit test',
      template: 'Dear {{student_name}}, urgent reminder for {{course}} fee: {{balance}}.'
    },
    authHeaders
  );
  console.log(`✓ Updated campaign name: "${updateRes.data.data.name}"`);

  // Step 8: Clean Up / Delete Campaign
  console.log('\n[8/8] Deleting Test Campaign...');
  const deleteRes = await axios.delete(
    `${BASE_URL}/automations/custom/${campaign._id}`,
    authHeaders
  );
  console.log(`✓ ${deleteRes.data.data.message}`);

  console.log('\n====================================================');
  console.log('    ✓ ALL 8 AUDIT PHASES PASSED WITH ZERO ERRORS!   ');
  console.log('====================================================\n');
}

verifyDeepAutomations().catch((err) => {
  console.error('Audit failed:', err.response?.data || err.message);
  process.exit(1);
});
