import fs from 'fs';

const BASE_URL = 'http://localhost:5000';
let brokerToken = '';
let adminToken = '';
let testPropertyId = '';
let testBuyerId = '';
let testDealId = '';
let testAliasId = '';
let testShareToken = '';

const results = [];

async function req(name, method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
    opts.body = JSON.stringify(body);
  }

  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, opts);
    let data;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const success = res.status >= 200 && res.status < 300;
    results.push({ name, method, path, status: res.status, ok: success, data, error: success ? null : data });
    console.log(`${success ? '✅' : '❌'} [${res.status}] ${method} ${path} - ${name}`);
    return { status: res.status, data, ok: success };
  } catch (err) {
    results.push({ name, method, path, status: 0, ok: false, error: err.message });
    console.log(`❌ [ERR] ${method} ${path} - ${name}: ${err.message}`);
    return { status: 0, ok: false, error: err.message };
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING END-TO-END TEST SUITE FOR LEADNIVESH API');
  console.log('====================================================\n');

  // --- 00. Health & Probes ---
  console.log('--- Category 00: Health & Probes ---');
  await req('Root Welcome Info', 'GET', '/');
  await req('Liveness Probe', 'GET', '/health');
  await req('Readiness Probe', 'GET', '/ready');
  await req('API v1 Base Info', 'GET', '/api/v1');

  // --- 01. Authentication & Sessions ---
  console.log('\n--- Category 01: Authentication & Sessions ---');
  const loginRes = await req('Broker Login', 'POST', '/api/v1/auth/login', {
    email: 'broker@leadnivesh.com',
    password: 'Broker@123456'
  });
  if (loginRes.ok && loginRes.data?.data?.accessToken) {
    brokerToken = loginRes.data.data.accessToken;
  }

  const adminLoginRes = await req('Admin Login', 'POST', '/api/v1/auth/login', {
    email: 'admin@leadnivesh.com',
    password: 'Admin@123456'
  });
  if (adminLoginRes.ok && adminLoginRes.data?.data?.accessToken) {
    adminToken = adminLoginRes.data.data.accessToken;
    const bId = loginRes.data?.data?.user?.id || loginRes.data?.data?.user?._id;
    if (bId) {
      // Ensure test broker has 'pro' tier capacity for test suite
      await fetch(`${BASE_URL}/api/v1/admin/users/${bId}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ tier: 'pro' }),
      }).catch(() => {});
    }
  }

  const randEmail = `testbroker_${Date.now()}@example.com`;
  await req('Register Broker', 'POST', '/api/v1/auth/register', {
    name: 'Test Registration Agent',
    email: randEmail,
    password: 'Password@1234',
    phone: '+919876543299',
    agency: { name: 'Test Agency', city: 'Panipat', reraNo: 'HRERA-TEST-99' },
    consent: { termsAccepted: true, privacyVersion: '1.0' }
  });

  await req('List Active Sessions', 'GET', '/api/v1/auth/sessions', null, brokerToken);
  await req('Request Password Reset', 'POST', '/api/v1/auth/forgot-password', { email: 'broker@leadnivesh.com' });

  // --- 02. Properties ---
  console.log('\n--- Category 02: Properties ---');
  const propRes = await req('Create Property', 'POST', '/api/v1/properties', {
    title: 'E2E Test 250 Gaj Plot Sector 12',
    type: 'Plot',
    category: 'Residential',
    purpose: 'Sale',
    locality: 'Sector 12',
    city: 'Panipat',
    landmark: 'Behind Mini Secretariat',
    size: { value: 250, unit: 'gaj' },
    priceDemandPaise: 1500000000,
    facing: 'North-East',
    tags: ['Corner', 'Wide Road'],
    description: 'Prime plot verified during automated E2E test suite run.',
    owner: { name: 'R. K. Bansal', phone: '+919812000001' },
    status: 'available',
    source: 'manual'
  }, brokerToken);

  if (propRes.ok && propRes.data?.data?._id) {
    testPropertyId = propRes.data.data._id;
  }

  await req('List Properties', 'GET', '/api/v1/properties?city=Panipat&status=available&limit=5', null, brokerToken);
  
  if (testPropertyId) {
    await req('Get Property by ID', 'GET', `/api/v1/properties/${testPropertyId}`, null, brokerToken);
    await req('Update Property Details', 'PATCH', `/api/v1/properties/${testPropertyId}`, {
      priceDemandPaise: 1480000000,
      tags: ['Corner', 'Wide Road', 'Price Negotiable']
    }, brokerToken);
    await req('Update Property Status', 'PATCH', `/api/v1/properties/${testPropertyId}/status`, {
      status: 'hold'
    }, brokerToken);
    await req('Revert Property Status to Available', 'PATCH', `/api/v1/properties/${testPropertyId}/status`, {
      status: 'available'
    }, brokerToken);

    const shareRes = await req('Generate Property Share Flyer', 'POST', `/api/v1/properties/${testPropertyId}/share`, {
      template: 'flyer'
    }, brokerToken);
    if (shareRes.ok && shareRes.data?.data?.token) {
      testShareToken = shareRes.data.data.token;
    }

    await req('Get Matches for Property', 'GET', `/api/v1/properties/${testPropertyId}/matches`, null, brokerToken);
    await req('Sign Photo Upload', 'POST', '/api/v1/properties/photos/sign', null, brokerToken);
  }

  // --- 03. Buyers ---
  console.log('\n--- Category 03: Buyers ---');
  const buyerRes = await req('Create Buyer Requirement', 'POST', '/api/v1/buyers', {
    name: 'Suresh Goyal',
    phone: '+919812334455',
    localities: [{ display: 'Sector 12', key: 'sector-12' }],
    anyLocality: false,
    types: ['Plot'],
    purpose: 'Sale',
    budget: { minPaise: 1200000000, maxPaise: 1600000000 },
    sizeGaj: { min: 200, max: 300 },
    urgency: 'hot',
    status: 'active',
    notes: 'Urgent buyer ready with cheque book.',
    source: 'manual'
  }, brokerToken);

  if (buyerRes.ok && buyerRes.data?.data?._id) {
    testBuyerId = buyerRes.data.data._id;
  }

  await req('List Buyers', 'GET', '/api/v1/buyers?status=active&urgency=hot&limit=5', null, brokerToken);
  if (testBuyerId) {
    await req('Get Buyer by ID', 'GET', `/api/v1/buyers/${testBuyerId}`, null, brokerToken);
    await req('Update Buyer', 'PATCH', `/api/v1/buyers/${testBuyerId}`, {
      notes: 'Updated budget tolerance up to 1.65 Cr.'
    }, brokerToken);
    await req('Get Matches for Buyer', 'GET', `/api/v1/buyers/${testBuyerId}/matches`, null, brokerToken);
  }

  // --- 04. Matches ---
  console.log('\n--- Category 04: Match Engine ---');
  await req('Quick Match Evaluation', 'POST', '/api/v1/matches/quick', {
    property: {
      type: 'Plot',
      purpose: 'Sale',
      localityKey: 'sector-12',
      priceDemandPaise: 1500000000,
      sizeGaj: 250
    },
    buyer: {
      purpose: 'Sale',
      types: ['Plot'],
      localities: [{ display: 'Sector 12', key: 'sector-12' }],
      budget: { minPaise: 1200000000, maxPaise: 1600000000 },
      sizeGaj: { min: 200, max: 300 }
    },
    tolerancePct: 10
  }, brokerToken);

  // --- 05. Deals & Commission ---
  console.log('\n--- Category 05: Deals & Commission ---');
  if (testBuyerId && testPropertyId) {
    const dealRes = await req('Create Deal', 'POST', '/api/v1/deals', {
      buyerId: testBuyerId,
      propertyId: testPropertyId,
      propertyTitleSnapshot: 'E2E Test 250 Gaj Plot Sector 12',
      valuePaise: 1480000000,
      commission: { mode: 'percent', bps: 100 },
      stage: 'interested',
      notes: 'Deal agreed at 1.48 Cr.'
    }, brokerToken);

    if (dealRes.ok && dealRes.data?.data?._id) {
      testDealId = dealRes.data.data._id;
    }
  }

  await req('List Deals', 'GET', '/api/v1/deals', null, brokerToken);
  await req('Get Deals Pipeline Summary', 'GET', '/api/v1/deals/summary', null, brokerToken);

  if (testDealId) {
    await req('Get Deal by ID', 'GET', `/api/v1/deals/${testDealId}`, null, brokerToken);
    await req('Update Deal Stage (Negotiating)', 'PATCH', `/api/v1/deals/${testDealId}/stage`, {
      stage: 'negotiating'
    }, brokerToken);
    await req('Record Commission Payment', 'POST', `/api/v1/deals/${testDealId}/payments`, {
      amountPaise: 2500000,
      note: 'Part commission token payment received',
      receivedAt: new Date().toISOString()
    }, brokerToken);
  }

  // --- 06. AI Parsing Engine ---
  console.log('\n--- Category 06: AI Parsing Engine ---');
  await req('Parse Unstructured Text', 'POST', '/api/v1/parse', {
    rawText: 'Urgent required: 250 gaj residential plot in Sector 12 Panipat budget 1.5 Cr cash client.'
  }, brokerToken);

  // --- 07. Dashboard ---
  console.log('\n--- Category 07: Broker Dashboard ---');
  await req('Get Today Dashboard Data', 'GET', '/api/v1/dashboard/today', null, brokerToken);

  // --- 08. Aliases ---
  console.log('\n--- Category 08: Locality Aliases ---');
  await req('List Locality Aliases', 'GET', '/api/v1/aliases?city=Panipat', null, brokerToken);
  const aliasRes = await req('Create Locality Alias', 'POST', '/api/v1/aliases', {
    canonical: 'Sector 24 HSIIDC',
    aliases: ['sec 24 hsiidc', 'hsiidc 24', 'sector 24 panipat'],
    city: 'Panipat'
  }, brokerToken);
  if (aliasRes.ok && aliasRes.data?.data?._id) {
    testAliasId = aliasRes.data.data._id;
    await req('Delete Custom Alias', 'DELETE', `/api/v1/aliases/${testAliasId}`, null, brokerToken);
  }

  // --- 09. User Profile ---
  console.log('\n--- Category 09: User Profile ---');
  await req('Get Profile (Me)', 'GET', '/api/v1/users/me', null, brokerToken);
  await req('Update Profile', 'PATCH', '/api/v1/users/me', {
    preferences: { budgetTolerancePct: 12, marlaToGaj: 30.25 }
  }, brokerToken);
  await req('Sign Logo Upload', 'POST', '/api/v1/users/me/logo/sign', null, brokerToken);
  await req('Export My Account Data', 'GET', '/api/v1/users/me/export', null, brokerToken);

  // --- 10. Public Endpoints & Inquiries ---
  console.log('\n--- Category 10: Public Endpoints & Inquiries ---');
  if (testPropertyId) {
    if (testShareToken) {
      await req('View Public Flyer HTML Page', 'GET', `/p/${testShareToken}`);
    }
    await req('Submit Public Inquiry on Flyer', 'POST', '/api/v1/public/inquiries', {
      propertyId: testPropertyId,
      name: 'Pankaj Varma',
      phone: '+919812999000',
      message: 'Interested in this property, please contact back.'
    });
  }
  await req('List Received Inquiries', 'GET', '/api/v1/inquiries', null, brokerToken);
  await req('Submit Platform Contact Form', 'POST', '/api/v1/public/contact', {
    name: 'Amitabh Sen',
    email: 'amitabh.sen@example.com',
    phone: '+919876540000',
    message: 'Testing platform contact form.'
  });
  await req('Submit Platform Contact Form (Alias)', 'POST', '/api/v1/contact', {
    name: 'Rohit Verma',
    phone: '+919876540001',
    message: 'Testing platform contact form via /contact alias.'
  });
  await req('List Platform Contact Leads (Broker)', 'GET', '/api/v1/public/contact', null, brokerToken);

  // --- 11. Trash & Recovery ---
  console.log('\n--- Category 11: Trash & Recovery ---');
  if (testPropertyId) {
    await req('Soft Delete Property (Move to Trash)', 'DELETE', `/api/v1/properties/${testPropertyId}`, null, brokerToken);
  }
  await req('List Trashed Items', 'GET', '/api/v1/trash', null, brokerToken);
  if (testPropertyId) {
    await req('Restore Trashed Property', 'POST', `/api/v1/trash/property/${testPropertyId}/restore`, null, brokerToken);
  }

  // --- 12. Admin Management ---
  console.log('\n--- Category 12: Admin Management ---');
  await req('Admin: List All Platform Users', 'GET', '/api/v1/admin/users?page=1&limit=10', null, adminToken);
  await req('Admin: Platform Usage & Telemetry', 'GET', '/api/v1/admin/usage', null, adminToken);
  await req('Admin: List Platform Inquiries', 'GET', '/api/v1/admin/inquiries', null, adminToken);
  await req('Admin: List Platform Contact Leads', 'GET', '/api/v1/admin/contacts', null, adminToken);

  console.log('\n====================================================');
  const total = results.length;
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`TOTAL ENDPOINTS TESTED : ${total}`);
  console.log(`PASSED (2xx OK)        : ${passed}`);
  console.log(`FAILED                 : ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) {
    console.log('❌ Failed Endpoints Detail:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`- [${r.status}] ${r.method} ${r.path} (${r.name}):`, JSON.stringify(r.error));
    });
  }
}

runTests();
