import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const HEADERS = {
  'Content-Type': 'application/json',
};

const results = [];

function recordTest(suite, name, passed, details = '') {
  results.push({ suite, name, passed, details });
  const statusIcon = passed ? '✅ PASS' : '❌ FAIL / VULNERABLE';
  console.log(`[${statusIcon}] [${suite}] ${name} ${details ? '(' + details + ')' : ''}`);
}

async function api(method, path, body = null, token = null) {
  const url = `${BASE_URL}${path}`;
  const h = { ...HEADERS };
  if (token) {
    h['Authorization'] = `Bearer ${token}`;
  }
  const opts = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, data: json, headers: res.headers };
}

async function runSecuritySuite() {
  console.log(`================================================================`);
  console.log(`🛡️  LEADNIVESH AUTHENTICATION & PASSWORD SECURITY AUDIT SUITE`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`================================================================\n`);

  // Setup: Register two separate isolated accounts for privilege and IDOR testing
  const ts = Date.now();
  const userA_cred = {
    name: 'Security User A',
    email: `sec_usera_${ts}@test.com`,
    password: 'Password@A12345!',
    phone: `+919811${String(ts).slice(-6)}`,
  };
  const userB_cred = {
    name: 'Security User B',
    email: `sec_userb_${ts}@test.com`,
    password: 'Password@B12345!',
    phone: `+919822${String(ts).slice(-6)}`,
  };

  const regA = await api('POST', '/api/v1/auth/register', {
    ...userA_cred,
    consent: { termsAccepted: true, privacyVersion: '1.0' },
  });
  const tokenA = regA.data?.data?.accessToken || regA.data?.accessToken;

  const regB = await api('POST', '/api/v1/auth/register', {
    ...userB_cred,
    consent: { termsAccepted: true, privacyVersion: '1.0' },
  });
  const tokenB = regB.data?.data?.accessToken || regB.data?.accessToken;

  if (!tokenA || !tokenB) {
    console.error('Fatal: Could not register test accounts');
    process.exit(1);
  }

  // User A creates a private property and private buyer
  const propA = await api(
    'POST',
    '/api/v1/properties',
    {
      title: 'Confidential Villa Sector 12',
      type: 'Kothi',
      purpose: 'Sale',
      locality: 'Sector 12',
      city: 'Panipat',
      priceDemandPaise: 2500000000,
      size: { value: 300, unit: 'gaj' },
      facing: 'North',
      owner: { phone: '+919999988888' },
      description: 'Private high-net-worth property',
    },
    tokenA
  );
  const propertyA_Id = propA.data?.data?._id || propA.data?._id;

  const buyerA = await api(
    'POST',
    '/api/v1/buyers',
    {
      name: 'High-Net-Worth VIP Client',
      phone: '+919999977777',
      purpose: 'Sale',
      types: ['Kothi'],
      localities: ['Sector 12'],
      budget: { minPaise: 2000000000, maxPaise: 3000000000 },
      urgency: 'hot',
      notes: 'Confidential client',
    },
    tokenA
  );
  const buyerA_Id = buyerA.data?.data?._id || buyerA.data?._id;

  console.log(`Setup complete. User A and User B registered with isolated data.\n`);

  // =========================================================================
  // SCENARIO 1: Accessing Protected Areas Without Authentication / Password
  // =========================================================================
  console.log(`--- Scenario 1: Unauthenticated Endpoint Access ---`);
  const protectedEndpoints = [
    { method: 'GET', path: '/api/v1/users/me' },
    { method: 'GET', path: '/api/v1/dashboard/today' },
    { method: 'GET', path: '/api/v1/properties' },
    { method: 'POST', path: '/api/v1/properties', body: { title: 'Unauthorized' } },
    { method: 'GET', path: '/api/v1/buyers' },
    { method: 'GET', path: '/api/v1/deals' },
    { method: 'GET', path: '/api/v1/trash' },
    { method: 'GET', path: '/api/v1/admin/users' },
  ];

  for (const ep of protectedEndpoints) {
    const res = await api(ep.method, ep.path, ep.body, null);
    const isProtected = res.status === 401;
    recordTest(
      'Unauthenticated Access',
      `${ep.method} ${ep.path}`,
      isProtected,
      `Status: ${res.status}`
    );
  }

  // =========================================================================
  // SCENARIO 2: Login With Incorrect Passwords & Brute-Force Rate Limiting
  // =========================================================================
  console.log(`\n--- Scenario 2: Password Verification & Brute-Force Defense ---`);

  // 2.1 Wrong password check
  const wrongPassResp = await api('POST', '/api/v1/auth/login', {
    email: userA_cred.email,
    password: 'CompletelyWrongPassword123!',
  });
  const rejectedWrongPass = wrongPassResp.status === 401;
  recordTest(
    'Password Verification',
    'Reject Incorrect Password',
    rejectedWrongPass,
    `Status: ${wrongPassResp.status}, Code: ${wrongPassResp.data?.error?.code || wrongPassResp.data?.code}`
  );

  // 2.2 Verify timing attack resistance (measure response duration for existing user vs non-existing user)
  const t0_exist = performance.now();
  await api('POST', '/api/v1/auth/login', {
    email: userA_cred.email,
    password: 'InvalidPasswordMeasure1!',
  });
  const durationExistMs = performance.now() - t0_exist;

  const t0_fake = performance.now();
  await api('POST', '/api/v1/auth/login', {
    email: `nonexistent_user_${Date.now()}@domain.com`,
    password: 'InvalidPasswordMeasure1!',
  });
  const durationFakeMs = performance.now() - t0_fake;

  const timingDiffMs = Math.abs(durationExistMs - durationFakeMs);
  const timingAttackResistant = timingDiffMs < 200; // Constant-time dummy hash ensures similar timing
  recordTest(
    'Timing Attack Defense',
    'Constant-Time Dummy bcrypt Compare',
    timingAttackResistant,
    `Exist: ${durationExistMs.toFixed(1)}ms vs Fake: ${durationFakeMs.toFixed(1)}ms (Diff: ${timingDiffMs.toFixed(1)}ms)`
  );

  // 2.3 Brute-force lockout test (send repeated bad attempts to check if lockout triggers)
  console.log('Sending consecutive failed login attempts to verify account lockout...');
  let lockoutTriggered = false;
  let lockoutStatus = 0;
  for (let i = 1; i <= 6; i++) {
    const attempt = await api('POST', '/api/v1/auth/login', {
      email: userA_cred.email,
      password: `WrongPasswordAttempt_${i}`,
    });
    if (attempt.status === 429) {
      lockoutTriggered = true;
      lockoutStatus = attempt.status;
      break;
    }
  }
  recordTest(
    'Brute-Force Protection',
    'Lockout Triggered (HTTP 429 Too Many Requests)',
    lockoutTriggered,
    `Triggered with status: ${lockoutStatus}`
  );

  // =========================================================================
  // SCENARIO 3: Authentication Bypass & JWT Manipulation Attacks
  // =========================================================================
  console.log(`\n--- Scenario 3: Token Manipulation & Auth Bypass Attacks ---`);

  // 3.1 Bearer with invalid signature (tampered token)
  const tokenParts = tokenA.split('.');
  const tamperedToken = `${tokenParts[0]}.${tokenParts[1]}.tampered_invalid_signature_xyz`;
  const tamperedResp = await api('GET', '/api/v1/users/me', null, tamperedToken);
  recordTest(
    'JWT Security',
    'Reject Tampered Signature',
    tamperedResp.status === 401,
    `Status: ${tamperedResp.status}`
  );

  // 3.2 Algorithm 'none' attack (forged unsigned token)
  const fakeHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const fakePayload = Buffer.from(
    JSON.stringify({
      _id: '507f1f77bcf86cd799439011',
      role: 'admin',
      email: 'admin@leadnivash.com',
    })
  ).toString('base64url');
  const algNoneToken = `${fakeHeader}.${fakePayload}.`;
  const algNoneResp = await api('GET', '/api/v1/users/me', null, algNoneToken);
  recordTest(
    'JWT Security',
    'Reject "alg: none" Token Forgery',
    algNoneResp.status === 401,
    `Status: ${algNoneResp.status}`
  );

  // 3.3 Expired token attack
  const expiredPayload = {
    _id: '507f1f77bcf86cd799439011',
    role: 'broker',
    exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
  };
  const expiredToken = jwt.sign(expiredPayload, 'some_random_secret_or_key');
  const expiredResp = await api('GET', '/api/v1/users/me', null, expiredToken);
  recordTest(
    'JWT Security',
    'Reject Expired Token',
    expiredResp.status === 401,
    `Status: ${expiredResp.status}`
  );

  // 3.4 NoSQL Injection in Login Payload
  const nosqlResp = await api('POST', '/api/v1/auth/login', {
    email: { $gt: '' },
    password: { $gt: '' },
  });
  const nosqlBlocked = nosqlResp.status === 400 || nosqlResp.status === 401;
  recordTest(
    'Injection Defense',
    'Block NoSQL Injection Payload in Login',
    nosqlBlocked,
    `Status: ${nosqlResp.status}`
  );

  // =========================================================================
  // SCENARIO 4: Sensitive Credential Leakage Audit
  // =========================================================================
  console.log(`\n--- Scenario 4: Sensitive Credential Exposure Audit ---`);

  // 4.1 Check /api/v1/users/me for leaked passwordHash or resetToken
  const profileResp = await api('GET', '/api/v1/users/me', null, tokenB);
  const profileStr = JSON.stringify(profileResp.data);
  const leaksPasswordHash =
    profileStr.includes('passwordHash') ||
    profileStr.includes('$2b$12$') ||
    profileStr.includes('passwordResetTokenHash') ||
    profileStr.includes('refreshTokenHash');

  recordTest(
    'Data Exposure Prevention',
    'User Profile /users/me Ommits Password Hashes',
    !leaksPasswordHash,
    leaksPasswordHash ? 'VULNERABLE: Hashes found in profile' : 'Clean: 0 hashes exposed'
  );

  // 4.2 Check User Data Export /api/v1/users/me/export
  const exportResp = await api('GET', '/api/v1/users/me/export', null, tokenB);
  const exportStr = JSON.stringify(exportResp.data);
  const exportLeaksHashes =
    exportStr.includes('passwordHash') ||
    exportStr.includes('$2b$12$') ||
    exportStr.includes('refreshTokenHash');

  recordTest(
    'Data Exposure Prevention',
    'Account Data Export Ommits Password Hashes',
    !exportLeaksHashes,
    exportLeaksHashes ? 'VULNERABLE: Hashes found in export' : 'Clean: 0 hashes exposed'
  );

  // =========================================================================
  // SCENARIO 5: Horizontal Privilege Escalation (IDOR Testing)
  // =========================================================================
  console.log(`\n--- Scenario 5: Horizontal Privilege Escalation (IDOR) ---`);

  // User B attempts to access, edit, or delete User A's property
  const bReadA_Prop = await api('GET', `/api/v1/properties/${propertyA_Id}`, null, tokenB);
  const bEditA_Prop = await api(
    'PATCH',
    `/api/v1/properties/${propertyA_Id}`,
    { title: 'Hacked Property' },
    tokenB
  );
  const bDeleteA_Prop = await api('DELETE', `/api/v1/properties/${propertyA_Id}`, null, tokenB);

  const idorPropertyBlocked =
    (bReadA_Prop.status === 403 || bReadA_Prop.status === 404) &&
    (bEditA_Prop.status === 403 || bEditA_Prop.status === 404) &&
    (bDeleteA_Prop.status === 403 || bDeleteA_Prop.status === 404);

  recordTest(
    'IDOR Defense',
    'User B Cannot Read, Modify or Delete User A Property',
    idorPropertyBlocked,
    `Read: ${bReadA_Prop.status}, Edit: ${bEditA_Prop.status}, Delete: ${bDeleteA_Prop.status}`
  );

  // User B attempts to access or edit User A's buyer
  const bReadA_Buyer = await api('GET', `/api/v1/buyers/${buyerA_Id}`, null, tokenB);
  const bEditA_Buyer = await api(
    'PATCH',
    `/api/v1/buyers/${buyerA_Id}`,
    { name: 'Compromised Buyer' },
    tokenB
  );

  const idorBuyerBlocked =
    (bReadA_Buyer.status === 403 || bReadA_Buyer.status === 404) &&
    (bEditA_Buyer.status === 403 || bEditA_Buyer.status === 404);

  recordTest(
    'IDOR Defense',
    'User B Cannot Read or Modify User A Buyer Lead',
    idorBuyerBlocked,
    `Read: ${bReadA_Buyer.status}, Edit: ${bEditA_Buyer.status}`
  );

  // =========================================================================
  // SCENARIO 6: Vertical Privilege Escalation (Role Tampering & Admin Access)
  // =========================================================================
  console.log(`\n--- Scenario 6: Vertical Privilege Escalation ---`);

  // 6.1 Normal Broker attempts to access Admin endpoints
  const adminEndpoints = [
    '/api/v1/admin/users',
    '/api/v1/admin/usage',
    '/api/v1/admin/inquiries',
    '/api/v1/admin/contacts',
  ];

  for (const path of adminEndpoints) {
    const res = await api('GET', path, null, tokenB);
    const blocked = res.status === 403 || res.status === 401;
    recordTest(
      'Role Escalation Defense',
      `Broker Blocked from Admin Endpoint: ${path}`,
      blocked,
      `Status: ${res.status}`
    );
  }

  // 6.2 Normal Broker attempts to escalate their own role to 'admin' via PATCH /users/me
  const escalateResp = await api(
    'PATCH',
    '/api/v1/users/me',
    {
      role: 'admin',
    },
    tokenB
  );

  // Re-fetch profile to check if role was altered
  const verifyProfile = await api('GET', '/api/v1/users/me', null, tokenB);
  const currentRole = verifyProfile.data?.data?.role || verifyProfile.data?.role;
  const escalationBlocked = currentRole !== 'admin';

  recordTest(
    'Role Tampering Defense',
    'Block Role Escalation via PATCH /api/v1/users/me',
    escalationBlocked,
    `Current Role: ${currentRole} (Admin Escalation Blocked)`
  );

  // Summary
  console.log(`\n================================================================`);
  console.log(`📊 SECURITY AUDIT SUMMARY`);
  console.log(`================================================================`);
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Checks Executed : ${total}`);
  console.log(`Passed Security Checks : ${passed}`);
  console.log(`Failed / Vulnerable   : ${failed}`);
  console.log(`Security Score        : ${((passed / total) * 100).toFixed(1)}%`);

  return { total, passed, failed, results };
}

runSecuritySuite()
  .then((summary) => {
    if (summary.failed > 0) {
      console.log(`\n⚠️ Security suite finished with ${summary.failed} identified issues.`);
    } else {
      console.log(`\n✅ Security suite finished. All defensive controls verified.`);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n❌ Security audit crashed with unhandled error:`, err);
    process.exit(1);
  });
