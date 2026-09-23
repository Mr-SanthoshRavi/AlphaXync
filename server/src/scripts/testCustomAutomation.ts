import axios from 'axios';

async function testCustomCampaign() {
  try {
    console.log('--- Step 1: Login as Admin ---');
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@stxavier.edu',
      password: 'AdminPassword123!'
    });
    const token = loginRes.data.data.token;
    console.log('✓ Logged in successfully!');

    console.log('\n--- Step 2: Fetching Discovered Google Sheet Variables ---');
    const varsRes = await axios.get('http://localhost:5000/api/automations/variables', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`✓ Discovered ${varsRes.data.data.totalDiscovered} variables:`);
    for (const v of varsRes.data.data.variables) {
      console.log(`  ${v.tag.padEnd(22)} [${v.category}] -> "${v.sample}"`);
    }

    console.log('\n--- Step 3: Testing Live Template Preview ---');
    const template = 'Hello {{student_name}} 👋\nWelcome to {{college_name}}.\nDear Parent: {{father_name}}\nYour {{course}} (Year {{year}}) prescribed fee is {{total_fee}}, balance: {{balance}}.\nPay: {{payment_link}}';
    const previewRes = await axios.post(
      'http://localhost:5000/api/automations/preview',
      { template },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('✓ Live Preview Rendered:');
    console.log('----------------------------------------------------');
    console.log(previewRes.data.data.rendered);
    console.log('----------------------------------------------------');

    console.log('\n--- Step 4: Creating a Custom Campaign ---');
    const createRes = await axios.post(
      'http://localhost:5000/api/automations/custom',
      {
        name: 'Orientation Welcome Broadcast',
        description: 'Sends WhatsApp circular to all students with real Google Sheet data',
        template,
        audience: { target: 'ALL' },
        schedule: { triggerType: 'MANUAL', maxExecutions: 1 },
        enabled: true
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const campaign = createRes.data.data;
    console.log('✓ Created campaign:', campaign._id, campaign.name);

    console.log('\n--- Step 5: Triggering Single Campaign ---');
    const triggerRes = await axios.post(
      `http://localhost:5000/api/automations/${campaign._id}/trigger-single`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('✓ Trigger response:', triggerRes.data);

    console.log('\n--- Step 7: Testing Update Custom Campaign ---');
    const updateRes = await axios.put(
      `http://localhost:5000/api/automations/custom/${campaign._id}`,
      {
        name: 'Orientation Welcome Broadcast (Updated)',
        template: 'Updated message for {{student_name}}!'
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('✓ Campaign updated:', updateRes.data.data.name);

    console.log('\n--- Step 8: Testing Delete Custom Campaign ---');
    const deleteRes = await axios.delete(
      `http://localhost:5000/api/automations/custom/${campaign._id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('✓ Campaign deleted:', deleteRes.data.data.message);

    console.log('\n>>> ALL BACKEND AUTOMATION TESTS PASSED PERFECTLY! <<<');
  } catch (err: any) {
    if (err.response) {
      console.error('HTTP Error Status:', err.response.status);
      console.error('HTTP Error Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error:', err.message);
    }
  }
}

testCustomCampaign();
