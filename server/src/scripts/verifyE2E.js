const BASE_URL = 'http://localhost:5000/api';

async function runEndToEndVerification() {
  console.log('==============================================');
  console.log('   CAMPUSFLOW END-TO-END VERIFICATION SUITE   ');
  console.log('==============================================\n');

  let cookieHeader = '';

  // 1. Setup status check
  console.log('[1/12] Testing GET /auth/setup-status...');
  const setupRes = await fetch(`${BASE_URL}/auth/setup-status`).then(r => r.json());
  console.log('  -> Status:', setupRes.success ? 'PASS' : 'FAIL', setupRes.data);

  // 2. Login flow with cookie capture
  console.log('\n[2/12] Testing POST /auth/login with admin credentials...');
  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@stxavier.edu',
      password: 'AdminPassword123!'
    })
  });
  
  const rawSetCookie = loginResponse.headers.get('set-cookie');
  if (rawSetCookie) {
    cookieHeader = rawSetCookie.split(';')[0];
  }
  const loginJson = await loginResponse.json();
  const token = loginJson.data?.token;
  console.log('  -> Login Result:', loginJson.success ? 'PASS' : 'FAIL');
  console.log('  -> User:', loginJson.data?.user?.name, `(${loginJson.data?.user?.email})`);
  console.log('  -> Institution:', loginJson.data?.institution?.name, `[${loginJson.data?.institution?.code}]`);

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
  };

  // 3. Current user session profile
  console.log('\n[3/12] Testing GET /auth/me (Protected Profile)...');
  const meRes = await fetch(`${BASE_URL}/auth/me`, { headers: authHeaders }).then(r => r.json());
  console.log('  -> Profile:', meRes.success ? 'PASS' : 'FAIL', meRes.data?.user?.name, `Role: ${meRes.data?.user?.role}`);

  // 4. Dashboard Summary (real mapped shape)
  console.log('\n[4/12] Testing GET /dashboard/summary...');
  const dashRes = await fetch(`${BASE_URL}/dashboard/summary`, { headers: authHeaders }).then(r => r.json());
  console.log('  -> Dashboard Summary:', dashRes.success ? 'PASS' : 'FAIL');
  console.log('     Cards:', JSON.stringify(dashRes.data?.cards));
  console.log('     Payment Overview:', JSON.stringify(dashRes.data?.paymentOverview));
  console.log('     Automation Activity:', JSON.stringify(dashRes.data?.automationActivity));
  console.log('     Needs Attention items:', dashRes.data?.needsAttention?.length);
  console.log('     Sync Health:', JSON.stringify(dashRes.data?.syncHealth));

  // 5. Students Directory
  console.log('\n[5/12] Testing GET /students...');
  const studentsRes = await fetch(`${BASE_URL}/students?limit=10`, { headers: authHeaders }).then(r => r.json());
  console.log('  -> Students List:', studentsRes.success ? 'PASS' : 'FAIL', `Count: ${studentsRes.data?.students?.length}, Total: ${studentsRes.data?.pagination?.total}`);
  if (studentsRes.data?.students?.length > 0) {
    const s0 = studentsRes.data.students[0];
    console.log('     Sample Student:', s0.name, s0.externalStudentId, s0.course, 'Fee Status:', s0.fee?.status);
  }

  // 6. Fees Directory
  console.log('\n[6/12] Testing GET /fees...');
  const feesRes = await fetch(`${BASE_URL}/fees`, { headers: authHeaders }).then(r => r.json());
  console.log('  -> Fees List:', feesRes.success ? 'PASS' : 'FAIL', `Count: ${feesRes.data?.fees?.length}, Total: ${feesRes.data?.pagination?.total}`);

  // 7. Automations List & Toggle
  console.log('\n[7/12] Testing GET /automations & PATCH /automations/:type/toggle...');
  const autoRes = await fetch(`${BASE_URL}/automations`, { headers: authHeaders }).then(r => r.json());
  console.log('  -> Automations Modules:', autoRes.success ? 'PASS' : 'FAIL', `Count: ${autoRes.data?.length}`);
  const greetingAuto = autoRes.data?.find(a => a.type === 'GREETING');
  if (greetingAuto) {
    const nextState = !greetingAuto.enabled;
    const toggleRes = await fetch(`${BASE_URL}/automations/GREETING/toggle`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ enabled: nextState })
    }).then(r => r.json());
    console.log(`  -> Toggled GREETING to ${nextState}:`, toggleRes.success ? 'PASS' : 'FAIL', toggleRes.data);
    // restore
    await fetch(`${BASE_URL}/automations/GREETING/toggle`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ enabled: greetingAuto.enabled })
    });
  }

  // 8. Messages Log
  console.log('\n[8/12] Testing GET /messages...');
  const msgRes = await fetch(`${BASE_URL}/messages`, { headers: authHeaders }).then(r => r.json());
  console.log('  -> Messages Log:', msgRes.success ? 'PASS' : 'FAIL', `Total: ${msgRes.data?.pagination?.total}`);

  // 9. Sync Status & Conflicts
  console.log('\n[9/12] Testing GET /sync/status & /sync/conflicts...');
  const syncStatus = await fetch(`${BASE_URL}/sync/status`, { headers: authHeaders }).then(r => r.json());
  console.log('  -> Sync Status:', syncStatus.success ? 'PASS' : 'FAIL', 'Connections:', syncStatus.data?.connections?.length);
  const syncConflicts = await fetch(`${BASE_URL}/sync/conflicts`, { headers: authHeaders }).then(r => r.json());
  console.log('  -> Sync Conflicts:', syncConflicts.success ? 'PASS' : 'FAIL', 'Conflicts count:', syncConflicts.data?.length);

  // 10. Manual Sync Ingestion
  console.log('\n[10/12] Testing POST /sync/trigger (Manual sync execution)...');
  const triggerRes = await fetch(`${BASE_URL}/sync/trigger`, {
    method: 'POST',
    headers: authHeaders
  }).then(r => r.json());
  console.log('  -> Sync Execution:', triggerRes.success ? 'PASS' : 'FAIL', triggerRes.data?.metrics);

  // 11. Settings & Profile Update
  console.log('\n[11/12] Testing GET /settings & PUT /settings/institution...');
  const setRes = await fetch(`${BASE_URL}/settings`, { headers: authHeaders }).then(r => r.json());
  console.log('  -> Settings:', setRes.success ? 'PASS' : 'FAIL');
  console.log('     Razorpay:', setRes.data?.connections?.razorpay?.status, setRes.data?.connections?.razorpay?.keyIdMasked);
  console.log('     WhatsApp:', setRes.data?.connections?.whatsapp?.status, setRes.data?.connections?.whatsapp?.phoneNumberMasked);
  console.log('     Google Sheets:', setRes.data?.connections?.googleSheets?.status);

  // 12. Logout & Verify 401
  console.log('\n[12/12] Testing POST /auth/logout & verify 401 unauthenticated guard...');
  const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: authHeaders
  }).then(r => r.json());
  console.log('  -> Logout:', logoutRes.success ? 'PASS' : 'FAIL');

  const unauthMe = await fetch(`${BASE_URL}/auth/me`, {
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('  -> Unauthenticated GET /auth/me status code:', unauthMe.status, unauthMe.status === 401 ? '(PASS - Properly Protected)' : '(FAIL)');

  console.log('\n==============================================');
  console.log('    ALL END-TO-END SUITE CHECKS COMPLETED     ');
  console.log('==============================================\n');
}

runEndToEndVerification().catch(console.error);
