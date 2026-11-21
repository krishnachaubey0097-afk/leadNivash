interface SmokeTestResult {
  step: string;
  url: string;
  status: number;
  pass: boolean;
  notes?: string;
}

async function runLiveSmokeTest() {
  console.log('====================================================');
  console.log('🌐 RUNNING PRODUCTION LIVE SMOKE TEST (HTTPS)');
  console.log('====================================================\n');

  const BASE_URL = 'https://leadnivash-frontend.vercel.app';
  const results: SmokeTestResult[] = [];

  // Helper fetch
  const testFetch = async (
    step: string,
    url: string,
    options: RequestInit = {}
  ): Promise<{ status: number; data: any; headers: Headers }> => {
    try {
      const res = await fetch(url, options);
      let data: any = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      const pass = res.status >= 200 && res.status < 400;
      results.push({ step, url, status: res.status, pass });
      console.log(`[${res.status}] ${step}: ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
      return { status: res.status, data, headers: res.headers };
    } catch (err: any) {
      results.push({ step, url, status: 0, pass: false, notes: err.message });
      console.log(`[ERR] ${step}: FAIL ❌ (${err.message})`);
      return { status: 0, data: null, headers: new Headers() };
    }
  };

  // 1. Root Frontend
  await testFetch('1. Frontend Landing Page', `${BASE_URL}/`);

  // 2. Health Probe via Vercel Rewrite
  await testFetch('2. Backend Health Probe (/health)', `${BASE_URL}/health`);

  // 3. API Root Info
  await testFetch('3. API Base Version Info (/api/v1)', `${BASE_URL}/api/v1`);

  // 4. Authentication Login
  console.log('\n--- Testing Authentication Flow on Live Deployment ---');
  let token = '';
  const loginRes = await testFetch(
    '4. Broker Login (POST /api/v1/auth/login)',
    `${BASE_URL}/api/v1/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'broker@leadnivesh.com',
        password: 'Broker@123456',
      }),
    }
  );

  if (loginRes.data?.data?.accessToken) {
    token = loginRes.data.data.accessToken;
    console.log('   Received valid JWT Bearer token.');
  } else {
    console.warn('   Login did not return accessToken:', loginRes.data);
  }

  // 5. Authenticated Endpoints
  if (token) {
    console.log('\n--- Testing Authenticated Core Features ---');
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // Properties List
    await testFetch('5. List Properties (GET /api/v1/properties)', `${BASE_URL}/api/v1/properties?limit=5`, {
      headers: authHeaders,
    });

    // Dashboard Today
    await testFetch('6. Today Broker Dashboard (GET /api/v1/dashboard/today)', `${BASE_URL}/api/v1/dashboard/today`, {
      headers: authHeaders,
    });

    // Buyers List
    await testFetch('7. List Buyers (GET /api/v1/buyers)', `${BASE_URL}/api/v1/buyers?limit=5`, {
      headers: authHeaders,
    });

    // Quick Chat Parsing
    await testFetch('8. Quick Chat Natural Language Parse (POST /api/v1/parse)', `${BASE_URL}/api/v1/parse`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        rawText: 'Need 3 BHK apartment in Model Town Panipat under 75 Lakh urgently',
      }),
    });
  }

  // 6. Direct Render Backend Probe
  console.log('\n--- Direct Backend Server Probe ---');
  await testFetch('9. Direct Render Backend Probe', 'https://leadnivash.onrender.com/health');

  // Summary
  console.log('\n====================================================');
  console.log('📊 LIVE SMOKE TEST SUMMARY');
  console.log('====================================================');
  const passedCount = results.filter((r) => r.pass).length;
  console.log(`Total Checks: ${results.length}`);
  console.log(`Passed:       ${passedCount}`);
  console.log(`Failed:       ${results.length - passedCount}`);
  console.log(`Pass Rate:    ${Math.round((passedCount / results.length) * 100)}%`);
  console.log('====================================================\n');
}

runLiveSmokeTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Smoke test crashed:', err);
    process.exit(1);
  });
