import axios from 'axios';

async function testAllFour() {
  const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
    email: 'admin@stxavier.edu',
    password: 'AdminPassword123!'
  });
  const token = loginRes.data.data.token;

  const feesRes = await axios.get('http://localhost:5000/api/fees?limit=10', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const fees = feesRes.data.data.fees;

  for (const f of fees) {
    console.log(`\nTesting Adjust Fee for ${f.studentName} (${f.registerNo}), current total=${f.total}...`);
    try {
      const res = await axios.post(
        'http://localhost:5000/api/payments/adjust-fee',
        {
          feeAccountId: f.id,
          newTotalAmount: f.total + 500,
          reason: 'Concession update'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      console.log(`Success for ${f.studentName}:`, res.status, res.data.data);
    } catch (err: any) {
      console.error(`FAILED for ${f.studentName}:`, err.response?.status, err.response?.data);
    }
  }
}

testAllFour();
