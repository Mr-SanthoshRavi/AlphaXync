import axios from 'axios';

async function testRazorpayEndToEnd() {
  const API_URL = 'http://localhost:5000/api';
  console.log('🚀 Starting Razorpay Flow End-to-End Verification...');

  try {
    // 0. Login as Admin to obtain access token
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@stxavier.edu',
      password: 'AdminPassword123!'
    });
    const token = loginRes.data?.data?.token || loginRes.data?.data?.accessToken;
    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
    console.log('✅ Admin Logged in successfully.');

    // 1. Fetch current fees list to pick a student with balance
    const feesRes = await axios.get(`${API_URL}/fees?limit=5`, authHeaders);
    const feesList = feesRes.data?.data?.fees || feesRes.data?.fees || [];
    const feeItem = feesList.find((f: any) => f.balance > 0) || feesList[0];
    
    if (!feeItem) {
      console.error('❌ No fee records found in system.');
      return;
    }

    console.log(`📌 Selected Student: ${feeItem.studentName} (${feeItem.registerNo}) | Current Balance: ₹${feeItem.balance}`);
    const testAmount = 1; // ₹1 test payment

    // 2. Create Payment Request (Token generation)
    console.log(`🔄 Generating Payment Gateway Intent for ₹${testAmount}...`);
    const reqRes = await axios.post(`${API_URL}/payments/request`, {
      studentId: feeItem.studentId,
      feeAccountId: feeItem.id,
      amount: testAmount,
      sendWhatsApp: false
    }, authHeaders);

    const paymentToken = reqRes.data?.data?.paymentToken;
    console.log(`✅ Payment Token Generated: ${paymentToken}`);

    // 3. Inspect public payment page data before payment
    const checkBefore = await axios.get(`${API_URL}/public/pay/${paymentToken}`);
    console.log(`🔍 Payment Intent Status Before Pay: ${checkBefore.data?.data?.status}`);
    if (checkBefore.data?.data?.status !== 'CREATED') {
      throw new Error(`Expected CREATED status, got: ${checkBefore.data?.data?.status}`);
    }

    // 4. Create Razorpay Checkout Order
    console.log(`💳 Creating Razorpay Order...`);
    const orderRes = await axios.post(`${API_URL}/public/pay/${paymentToken}/order`);
    const { orderId, keyId } = orderRes.data?.data;
    console.log(`✅ Razorpay Order Created: ${orderId} (Key: ${keyId})`);

    // 5. Complete payment verification (Simulating Razorpay handler callback)
    console.log(`🔐 Verifying Razorpay Payment with Server...`);
    const mockPaymentId = `pay_rzp_${Date.now()}`;
    const verifyRes = await axios.post(`${API_URL}/public/pay/${paymentToken}/verify`, {
      razorpayOrderId: orderId,
      razorpayPaymentId: mockPaymentId,
      razorpaySignature: 'test_signature_mock'
    });

    console.log(`✅ Payment Verification Response:`, verifyRes.data);
    const receiptNumber = verifyRes.data?.data?.receiptNumber;
    console.log(`📜 Generated Receipt Number: ${receiptNumber}`);

    // 6. Inspect public payment page data AFTER payment (simulating the Admin modal polling loop)
    console.log(`🔄 Polling Intent Status after completion (Admin Auto-Detection check)...`);
    const checkAfter = await axios.get(`${API_URL}/public/pay/${paymentToken}`);
    console.log(`✅ Polling Result:`, checkAfter.data?.data);

    if (checkAfter.data?.data?.status === 'COMPLETED') {
      console.log(`🎉 SUCCESS! Admin auto-detection polling will immediately receive status=COMPLETED and popup the official receipt!`);
      console.log(`   Receipt: ${checkAfter.data?.data?.receiptNumber} | Amount: ₹${checkAfter.data?.data?.amount}`);
    } else {
      console.error(`❌ Verification failed: status is ${checkAfter.data?.data?.status}`);
    }

  } catch (err: any) {
    console.error('❌ Test failed with error:', err?.response?.data || err.message);
  }
}

testRazorpayEndToEnd();
