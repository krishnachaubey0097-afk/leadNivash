import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:5000';
let db;

// State tracked during test run
let brokerToken = '';
let brokerUserId = '';
let adminToken = '';

// Test entities
let testPropertyId = null;
let testBuyerId = null;
let testDealId = null;
let testAliasId = null;
let testShareToken = null;
let testInquiryId = null;
let testContactId = null;
let testCommitPropertyId = null;

let totalScenarios = 0;
let passedScenarios = 0;
let failedScenarios = 0;

// HTTP client helper
async function api(name, method, path, body = null, token = null, expectedStatus = [200, 201]) {
  totalScenarios++;
  const headers = { 'Content-Type': 'application/json', 'x-test-suite': 'leadnivesh-internal-test' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    opts.body = JSON.stringify(body);
  }

  const expList = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];

  try {
    const res = await fetch(`${BASE_URL}${path}`, opts);
    let data;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const matched = expList.includes(res.status);
    if (matched) {
      console.log(`  🟢 [${res.status}] ${method} ${path} — ${name}`);
      passedScenarios++;
      return { ok: true, status: res.status, data };
    } else {
      console.error(`  🔴 [FAIL: Got ${res.status}, Expected ${expList.join('/')}] ${method} ${path} — ${name}`);
      console.error('     Response Body:', JSON.stringify(data).substring(0, 300));
      failedScenarios++;
      return { ok: false, status: res.status, data };
    }
  } catch (err) {
    console.error(`  🔴 [NET ERR] ${method} ${path} — ${name}: ${err.message}`);
    failedScenarios++;
    return { ok: false, status: 0, error: err.message };
  }
}

// Database assertion helper
async function assertDb(desc, collectionName, query, validatorFn) {
  totalScenarios++;
  try {
    const doc = await db.collection(collectionName).findOne(query);
    const valid = validatorFn(doc);
    if (valid) {
      console.log(`     🔍 DB-VERIFY: ${desc} in '${collectionName}' [PASSED]`);
      passedScenarios++;
      return true;
    } else {
      console.error(`     ❌ DB-FAIL: ${desc} in '${collectionName}' [FAILED CHECK]`);
      console.error('        Found Document:', doc ? JSON.stringify(doc).substring(0, 300) : 'null');
      failedScenarios++;
      return false;
    }
  } catch (err) {
    console.error(`     ❌ DB-EXCEPTION: ${desc} in '${collectionName}': ${err.message}`);
    failedScenarios++;
    return false;
  }
}

async function run() {
  console.log('================================================================');
  console.log('🧪 LEADNIVESH: FULL MULTI-SCENARIO API + DATABASE VERIFICATION');
  console.log('================================================================\n');

  console.log('Connecting directly to MongoDB Atlas...');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'leadnivash' });
  db = mongoose.connection.db;
  console.log('✅ Connected to MongoDB Atlas:', db.databaseName, '\n');

  // ============================================================================
  // 00. HEALTH & SYSTEM PROBES
  // ============================================================================
  console.log('--- [00] Health, Readiness & System Probes ---');
  await api('Liveness probe returns 200 ok', 'GET', '/health');
  await api('Readiness probe returns 200 ready', 'GET', '/ready');
  await api('API v1 root info returns version 1.0.0', 'GET', '/api/v1');

  // ============================================================================
  // 01. AUTHENTICATION, SESSIONS & SECURITY
  // ============================================================================
  console.log('\n--- [01] Authentication, Multi-Sessions & Security ---');
  
  // 1.1 Broker Login
  const bLogin = await api('Broker Login (valid credentials)', 'POST', '/api/v1/auth/login', {
    email: 'broker@leadnivesh.com',
    password: 'Broker@123456'
  });
  if (bLogin.ok && bLogin.data?.data?.accessToken) {
    brokerToken = bLogin.data.data.accessToken;
    brokerUserId = bLogin.data.data.user._id;
  }
  await assertDb('Active session added to user record', 'users', { email: 'broker@leadnivesh.com' }, (doc) => {
    return doc && Array.isArray(doc.sessions) && doc.sessions.length > 0;
  });

  // 1.2 Admin Login
  const aLogin = await api('Admin Login (valid credentials)', 'POST', '/api/v1/auth/login', {
    email: 'admin@leadnivesh.com',
    password: 'Admin@123456'
  });
  if (aLogin.ok && aLogin.data?.data?.accessToken) {
    adminToken = aLogin.data.data.accessToken;
  }

  // 1.3 Rejected Login Scenario (Invalid password)
  await api('Invalid Login rejected with 401', 'POST', '/api/v1/auth/login', {
    email: 'broker@leadnivesh.com',
    password: 'WrongPassword999!'
  }, null, 401);

  // 1.4 List Active Sessions
  const sessRes = await api('List broker sessions', 'GET', '/api/v1/auth/sessions', null, brokerToken);
  let sessionToRevoke = null;
  if (sessRes.ok && Array.isArray(sessRes.data?.data) && sessRes.data.data.length > 1) {
    sessionToRevoke = sessRes.data.data[0].id;
  }

  // 1.5 Revoke Session Scenario
  if (sessionToRevoke) {
    await api('Revoke specific session', 'DELETE', `/api/v1/auth/sessions/${sessionToRevoke}`, null, brokerToken);
    await assertDb('Revoked session removed from database', 'users', { email: 'broker@leadnivesh.com' }, (doc) => {
      return doc && !doc.sessions.some(s => s._id?.toString() === sessionToRevoke);
    });
  }

  // 1.6 Refresh Token Scenario
  await api('Token refresh returns valid response', 'POST', '/api/v1/auth/refresh', null, null, [200, 401]);

  // 1.7 Register New Broker Scenario
  const newEmail = `broker_scenario_${Date.now()}@leadnivesh-test.com`;
  const regRes = await api('Register brand-new broker account', 'POST', '/api/v1/auth/register', {
    name: 'Scenario Broker Test',
    email: newEmail,
    password: 'SecurePassword@1234',
    phone: '+919876543219',
    agency: { name: 'Test Realtors', city: 'Panipat', reraNo: 'HRERA-SCEN-1' },
    consent: { termsAccepted: true, privacyVersion: '1.0' }
  }, null, 201);
  await assertDb('Registered user saved in DB', 'users', { email: newEmail }, (doc) => {
    return doc && doc.name === 'Scenario Broker Test' && (doc.role === 'user' || doc.role === 'broker');
  });

  // 1.8 Duplicate Registration Conflict Scenario (409)
  await api('Duplicate email registration rejected with 409', 'POST', '/api/v1/auth/register', {
    name: 'Duplicate Broker',
    email: newEmail,
    password: 'Password@123',
    phone: '+919876543218',
    agency: { name: 'Dup Agency' },
    consent: { termsAccepted: true, privacyVersion: '1.0' }
  }, null, 409);

  // Clean up registered test user
  await db.collection('users').deleteOne({ email: newEmail });

  // 1.9 Password Reset Request Scenario
  await api('Forgot Password request handled', 'POST', '/api/v1/auth/forgot-password', {
    email: 'broker@leadnivesh.com'
  });

  // ============================================================================
  // 02. PROPERTY INVENTORY FULL LIFECYCLE & STATE MACHINE
  // ============================================================================
  console.log('\n--- [02] Properties Lifecycle (Create ➔ Update ➔ Hold ➔ Sold ➔ Soft-Delete ➔ Restore ➔ Permanent Purge) ---');

  // 2.1 Validation Error Scenario (Negative Price)
  await api('Validation rejection on malformed property', 'POST', '/api/v1/properties', {
    type: 'Plot',
    locality: 'Sector 12',
    priceDemandPaise: -500
  }, brokerToken, 400);

  // 2.2 Create Property (Happy Path)
  const propRes = await api('Create Property listing in Panipat', 'POST', '/api/v1/properties', {
    title: 'Automated Test Luxury Kothi in Sector 12',
    type: 'Kothi',
    category: 'Residential',
    purpose: 'Sale',
    locality: 'Sector 12',
    city: 'Panipat',
    landmark: 'Opposite Community Center',
    size: { value: 250, unit: 'gaj' },
    priceDemandPaise: 950000000, // ₹95 Lakhs
    facing: 'North-East',
    tags: ['Corner', 'Park Facing'],
    description: 'Corner kothi in prime sector 12 location'
  }, brokerToken, 201);

  if (propRes.ok && propRes.data?.data?._id) {
    testPropertyId = propRes.data.data._id;
  }

  // DB Verification: Property created in MongoDB
  await assertDb('Property inserted with status=available and isDeleted=false', 'properties', { _id: new mongoose.Types.ObjectId(testPropertyId) }, (doc) => {
    return doc && doc.status === 'available' && doc.isDeleted === false && doc.priceDemandPaise === 950000000;
  });

  // 2.3 Read Single Property
  await api('Get property details by ID', 'GET', `/api/v1/properties/${testPropertyId}`, null, brokerToken);

  // 2.4 List Properties with filter
  await api('List properties with localityKey filter', 'GET', '/api/v1/properties?status=available&limit=5', null, brokerToken);

  // 2.5 Change Property Details (PATCH)
  await api('Update property price & description', 'PATCH', `/api/v1/properties/${testPropertyId}`, {
    priceDemandPaise: 920000000,
    description: 'Special weekend price reduction!'
  }, brokerToken);

  // DB Verification: Fields updated in MongoDB
  await assertDb('Price updated to 920000000 in DB', 'properties', { _id: new mongoose.Types.ObjectId(testPropertyId) }, (doc) => {
    return doc && doc.priceDemandPaise === 920000000 && doc.description.includes('weekend');
  });

  // 2.6 State Transition Scenario 1: Move to HOLD
  await api('Change status to HOLD (token deposit received)', 'PATCH', `/api/v1/properties/${testPropertyId}/status`, {
    status: 'hold'
  }, brokerToken);
  await assertDb('Property status updated to hold in DB', 'properties', { _id: new mongoose.Types.ObjectId(testPropertyId) }, (doc) => {
    return doc && doc.status === 'hold';
  });

  // 2.7 State Transition Scenario 2: Move to SOLD
  await api('Change status to SOLD', 'PATCH', `/api/v1/properties/${testPropertyId}/status`, {
    status: 'sold'
  }, brokerToken);
  await assertDb('Property status updated to sold in DB', 'properties', { _id: new mongoose.Types.ObjectId(testPropertyId) }, (doc) => {
    return doc && doc.status === 'sold';
  });

  // 2.8 State Transition Scenario 3: Revert to AVAILABLE
  await api('Revert status back to AVAILABLE', 'PATCH', `/api/v1/properties/${testPropertyId}/status`, {
    status: 'available'
  }, brokerToken);
  await assertDb('Property status reverted to available in DB', 'properties', { _id: new mongoose.Types.ObjectId(testPropertyId) }, (doc) => {
    return doc && doc.status === 'available';
  });

  // 2.9 Generate Share Link
  const shareRes = await api('Generate public flyer share link', 'POST', `/api/v1/properties/${testPropertyId}/share`, {
    template: 'flyer'
  }, brokerToken);
  if (shareRes.ok && shareRes.data?.data?.token) {
    testShareToken = shareRes.data.data.token;
  }
  await assertDb('ShareLink record created in DB', 'sharelinks', { propertyId: new mongoose.Types.ObjectId(testPropertyId) }, (doc) => {
    return doc && doc.token && doc.isRevoked === false;
  });

  // 2.10 Match Engine for Property
  await api('Query matching buyers for property', 'GET', `/api/v1/properties/${testPropertyId}/matches`, null, brokerToken);

  // 2.11 Discard / Soft-Delete Scenario
  await api('Soft-delete property to Trash', 'DELETE', `/api/v1/properties/${testPropertyId}`, null, brokerToken);
  await assertDb('Property marked isDeleted=true in DB', 'properties', { _id: new mongoose.Types.ObjectId(testPropertyId) }, (doc) => {
    return doc && doc.isDeleted === true && doc.deletedAt !== null;
  });

  // 2.12 Verify soft-deleted property is hidden from active GET
  await api('Soft-deleted property returns 404 on active GET', 'GET', `/api/v1/properties/${testPropertyId}`, null, brokerToken, 404);

  // 2.13 Verify property appears in Trash
  await api('List trash items includes property', 'GET', '/api/v1/trash', null, brokerToken);

  // 2.14 Restore Property from Trash Scenario (type: 'property')
  await api('Restore property from Trash', 'POST', `/api/v1/trash/property/${testPropertyId}/restore`, null, brokerToken);
  await assertDb('Property restored: isDeleted=false in DB', 'properties', { _id: new mongoose.Types.ObjectId(testPropertyId) }, (doc) => {
    return doc && doc.isDeleted === false;
  });

  // 2.15 Permanent Eradication Scenario (Soft-delete -> Purge with confirmText)
  await api('Soft-delete property again before permanent purge', 'DELETE', `/api/v1/properties/${testPropertyId}`, null, brokerToken);
  await api('Permanently purge property from Trash', 'DELETE', `/api/v1/trash/property/${testPropertyId}`, {
    confirmText: 'PERMANENT DELETE'
  }, brokerToken);
  await assertDb('Property completely eradicated (null) from DB', 'properties', { _id: new mongoose.Types.ObjectId(testPropertyId) }, (doc) => {
    return doc === null;
  });

  // ============================================================================
  // 03. BUYERS FULL LIFECYCLE (Create ➔ Update ➔ Soft-Delete ➔ Restore ➔ Purge)
  // ============================================================================
  console.log('\n--- [03] Buyers Lifecycle (Create ➔ Update ➔ Soft-Delete ➔ Restore ➔ Purge) ---');

  // 3.1 Validation Error Scenario
  await api('Validation rejection on buyer with missing budget', 'POST', '/api/v1/buyers', {
    name: 'Invalid Buyer',
    phone: '123'
  }, brokerToken, 400);

  // 3.2 Create Buyer (Happy Path)
  const buyerRes = await api('Register new buyer requirement', 'POST', '/api/v1/buyers', {
    name: 'Vikram Malhotra',
    phone: '+919876543201',
    types: ['Plot', 'Kothi'],
    purpose: 'Sale',
    localities: ['Sector 12', 'Model Town'],
    budget: {
      minPaise: 700000000, // ₹70L
      maxPaise: 1000000000  // ₹1 Cr
    },
    urgency: 'hot',
    notes: 'Looking for a plot or ready kothi in Sector 12 or Model Town'
  }, brokerToken, 201);

  if (buyerRes.ok && buyerRes.data?.data?._id) {
    testBuyerId = buyerRes.data.data._id;
  }
  await assertDb('Buyer inserted with maxPaise=1000000000 in DB', 'buyers', { _id: new mongoose.Types.ObjectId(testBuyerId) }, (doc) => {
    return doc && doc.name === 'Vikram Malhotra' && doc.budget?.maxPaise === 1000000000 && doc.isDeleted === false;
  });

  // 3.3 Read Buyer Details & List
  await api('Get buyer by ID', 'GET', `/api/v1/buyers/${testBuyerId}`, null, brokerToken);
  await api('List buyers with urgency filter', 'GET', '/api/v1/buyers?urgency=hot', null, brokerToken);

  // 3.4 Update Buyer Details
  await api('Update buyer max budget to ₹1.2 Cr', 'PATCH', `/api/v1/buyers/${testBuyerId}`, {
    budget: {
      minPaise: 800000000,
      maxPaise: 1200000000
    },
    urgency: 'warm'
  }, brokerToken);
  await assertDb('Buyer updated in DB: maxPaise=1200000000', 'buyers', { _id: new mongoose.Types.ObjectId(testBuyerId) }, (doc) => {
    return doc && doc.budget?.maxPaise === 1200000000 && doc.urgency === 'warm';
  });

  // 3.5 Find Matching Properties for Buyer
  await api('Query matching properties for buyer', 'GET', `/api/v1/buyers/${testBuyerId}/matches`, null, brokerToken);

  // 3.6 Soft-delete Buyer Scenario
  await api('Soft-delete buyer to Trash', 'DELETE', `/api/v1/buyers/${testBuyerId}`, null, brokerToken);
  await assertDb('Buyer marked isDeleted=true in DB', 'buyers', { _id: new mongoose.Types.ObjectId(testBuyerId) }, (doc) => {
    return doc && doc.isDeleted === true;
  });

  // 3.7 Restore Buyer Scenario
  await api('Restore buyer from Trash', 'POST', `/api/v1/trash/buyer/${testBuyerId}/restore`, null, brokerToken);
  await assertDb('Buyer restored: isDeleted=false in DB', 'buyers', { _id: new mongoose.Types.ObjectId(testBuyerId) }, (doc) => {
    return doc && doc.isDeleted === false;
  });

  // ============================================================================
  // 04. MATCH ENGINE
  // ============================================================================
  console.log('\n--- [04] Match Engine Quick Evaluation ---');
  await api('Evaluate quick ad-hoc match between buyer & property payloads', 'POST', '/api/v1/matches/quick', {
    property: {
      type: 'Plot',
      purpose: 'Sale',
      localityKey: 'sector-12',
      priceDemandPaise: 850000000,
      sizeGaj: 200,
      status: 'available'
    },
    buyer: {
      purpose: 'Sale',
      types: ['Plot'],
      localities: [{ key: 'sector-12', display: 'Sector 12' }],
      budget: {
        minPaise: 800000000,
        maxPaise: 900000000
      }
    }
  }, brokerToken);

  // ============================================================================
  // 05. DEALS & COMMISSION PIPELINE (Stages, Discard/Lost with Reason, Payments)
  // ============================================================================
  console.log('\n--- [05] Deals & Commission Pipeline (Stages, Discard/Lost, Finalize, Payments, Purge) ---');

  // 5.1 Create Deal
  const dealRes = await api('Create new deal tied to buyer', 'POST', '/api/v1/deals', {
    buyerId: testBuyerId,
    propertyTitleSnapshot: 'Sector 12 Luxury Kothi (Deal Track)',
    valuePaise: 900000000, // ₹90 Lakhs
    commission: {
      mode: 'percent',
      bps: 200 // 2% = ₹1.8 Lakhs (18000000 paise)
    },
    stage: 'interested'
  }, brokerToken, 201);

  if (dealRes.ok && dealRes.data?.data?._id) {
    testDealId = dealRes.data.data._id;
  }
  await assertDb('Deal created with expected commission in DB', 'deals', { _id: new mongoose.Types.ObjectId(testDealId) }, (doc) => {
    return doc && doc.stage === 'interested' && doc.commission?.expectedPaise === 18000000;
  });

  // 5.2 Read Deal & List Deals
  await api('Get deal details by ID', 'GET', `/api/v1/deals/${testDealId}`, null, brokerToken);
  await api('List deals for broker', 'GET', '/api/v1/deals', null, brokerToken);

  // 5.3 Stage Transition 1: Shown
  await api('Transition stage to SHOWN', 'PATCH', `/api/v1/deals/${testDealId}/stage`, {
    stage: 'shown'
  }, brokerToken);
  await assertDb('Deal stage updated to shown in DB', 'deals', { _id: new mongoose.Types.ObjectId(testDealId) }, (doc) => {
    return doc && doc.stage === 'shown';
  });

  // 5.4 Stage Transition 2: Negotiating
  await api('Transition stage to NEGOTIATING', 'PATCH', `/api/v1/deals/${testDealId}/stage`, {
    stage: 'negotiating'
  }, brokerToken);
  await assertDb('Deal stage updated to negotiating in DB', 'deals', { _id: new mongoose.Types.ObjectId(testDealId) }, (doc) => {
    return doc && doc.stage === 'negotiating';
  });

  // 5.5 Discard / Lost Scenario — REJECTED WITHOUT REASON (Validation Error)
  await api('Move to LOST without reason rejected with 400', 'PATCH', `/api/v1/deals/${testDealId}/stage`, {
    stage: 'lost'
  }, brokerToken, 400);

  // 5.6 Discard / Lost Scenario — ACCEPTED WITH REASON
  await api('Move to LOST with mandatory reason accepted', 'PATCH', `/api/v1/deals/${testDealId}/stage`, {
    stage: 'lost',
    lostReason: 'Buyer chose another location outside Panipat'
  }, brokerToken);
  await assertDb('Deal marked lost with reason in DB', 'deals', { _id: new mongoose.Types.ObjectId(testDealId) }, (doc) => {
    return doc && doc.stage === 'lost' && doc.lostReason?.includes('outside Panipat');
  });

  // 5.7 Approve / Finalize Deal Scenario (Revived & Closed)
  await api('Reopen and Finalize/Approve deal', 'PATCH', `/api/v1/deals/${testDealId}/stage`, {
    stage: 'finalized'
  }, brokerToken);
  await assertDb('Deal stage finalized in DB', 'deals', { _id: new mongoose.Types.ObjectId(testDealId) }, (doc) => {
    return doc && doc.stage === 'finalized';
  });

  // 5.8 Record Commission Payment Scenario
  await api('Record commission payment (₹50,000 received)', 'POST', `/api/v1/deals/${testDealId}/payments`, {
    amountPaise: 5000000,
    note: 'Initial token commission advance'
  }, brokerToken);
  await assertDb('Payment appended to deal in DB', 'deals', { _id: new mongoose.Types.ObjectId(testDealId) }, (doc) => {
    return doc && Array.isArray(doc.payments) && doc.payments.some(p => p.amountPaise === 5000000);
  });

  // 5.9 Soft-delete & Permanent Eradicate Deal Scenario
  await api('Soft-delete deal to Trash', 'DELETE', `/api/v1/deals/${testDealId}`, null, brokerToken);
  await assertDb('Deal marked isDeleted=true in DB', 'deals', { _id: new mongoose.Types.ObjectId(testDealId) }, (doc) => {
    return doc && doc.isDeleted === true;
  });

  await api('Permanently purge deal from Trash', 'DELETE', `/api/v1/trash/deal/${testDealId}`, {
    confirmText: 'PERMANENT DELETE'
  }, brokerToken);
  await assertDb('Deal completely purged (null) from DB', 'deals', { _id: new mongoose.Types.ObjectId(testDealId) }, (doc) => {
    return doc === null;
  });

  // Clean up test buyer
  await api('Soft-delete test buyer before permanent purge', 'DELETE', `/api/v1/buyers/${testBuyerId}`, null, brokerToken);
  await api('Permanently purge test buyer from Trash', 'DELETE', `/api/v1/trash/buyer/${testBuyerId}`, {
    confirmText: 'PERMANENT DELETE'
  }, brokerToken);
  await assertDb('Buyer completely purged (null) from DB', 'buyers', { _id: new mongoose.Types.ObjectId(testBuyerId) }, (doc) => {
    return doc === null;
  });

  // ============================================================================
  // 06. AI WHATSAPP / TEXT PARSER ENGINE
  // ============================================================================
  console.log('\n--- [06] AI WhatsApp Text Parser (Preview Ingest ➔ User Review ➔ Commit to DB) ---');

  // 6.1 Preview Extraction
  await api('Ingest & extract raw WhatsApp property message', 'POST', '/api/v1/parse', {
    rawText: 'Urgent sale! 200 gaj residential plot in Sector 12 Panipat near Community Center. Demand 60 Lakh negotiable. Contact Rajesh 9876543210.'
  }, brokerToken);

  // 6.2 Commit Parsed Data with user modifications to Database
  const commitRes = await api('Commit reviewed parse item to inventory', 'POST', '/api/v1/parse/commit', {
    itemType: 'listing',
    data: {
      title: '200 Gaj Plot in Sector 12 (Parsed & Committed)',
      type: 'Plot',
      category: 'Residential',
      purpose: 'Sale',
      locality: 'Sector 12',
      city: 'Panipat',
      size: { value: 200, unit: 'gaj' },
      priceDemandPaise: 600000000,
      description: 'Parsed via AI engine from broker WhatsApp message'
    }
  }, brokerToken, 201);

  if (commitRes.ok && commitRes.data?.data?.item?._id) {
    testCommitPropertyId = commitRes.data.data.item._id;
  }
  await assertDb('Committed parse item saved directly in properties DB', 'properties', { _id: new mongoose.Types.ObjectId(testCommitPropertyId) }, (doc) => {
    return doc && doc.priceDemandPaise === 600000000 && doc.status === 'available';
  });

  // Clean up committed property
  if (testCommitPropertyId) {
    await db.collection('properties').deleteOne({ _id: new mongoose.Types.ObjectId(testCommitPropertyId) });
  }

  // ============================================================================
  // 07. BROKER DASHBOARD
  // ============================================================================
  console.log('\n--- [07] Broker Dashboard Aggregations ---');
  await api('Fetch today dashboard summary metrics', 'GET', '/api/v1/dashboard/today', null, brokerToken);
  await api('Fetch base dashboard metrics', 'GET', '/api/v1/dashboard', null, brokerToken);

  // ============================================================================
  // 08. LOCALITY ALIASES & NORMALIZATION
  // ============================================================================
  console.log('\n--- [08] Locality Aliases (Create ➔ Update ➔ Delete) ---');

  // 8.1 Create Locality Alias
  const aliasRes = await api('Create new locality alias mapping', 'POST', '/api/v1/aliases', {
    city: 'Panipat',
    canonical: 'Sukhdev Nagar',
    aliases: ['Sukhdev Ngr', 'Sukh Dev Nagar', 'Sukhdev Panipat']
  }, brokerToken, 201);

  if (aliasRes.ok && aliasRes.data?.data?._id) {
    testAliasId = aliasRes.data.data._id;
  }
  await assertDb('Locality alias inserted with canonicalKey in DB', 'localityaliases', { _id: new mongoose.Types.ObjectId(testAliasId) }, (doc) => {
    return doc && doc.canonical === 'Sukhdev Nagar' && doc.canonicalKey === 'sukhdev-nagar';
  });

  // 8.2 List Aliases
  await api('List locality aliases', 'GET', '/api/v1/aliases?limit=5', null, brokerToken);

  // 8.3 Update Alias
  await api('Append new alias spelling to locality', 'PATCH', `/api/v1/aliases/${testAliasId}`, {
    aliases: ['Sukhdev Ngr', 'Sukh Dev Nagar', 'Sukhdev Panipat', 'SDN Panipat']
  }, brokerToken);
  await assertDb('Alias list updated in DB', 'localityaliases', { _id: new mongoose.Types.ObjectId(testAliasId) }, (doc) => {
    return doc && doc.aliases.includes('SDN Panipat');
  });

  // 8.4 Delete Alias
  await api('Delete locality alias mapping', 'DELETE', `/api/v1/aliases/${testAliasId}`, null, brokerToken);
  await assertDb('Locality alias purged from DB', 'localityaliases', { _id: new mongoose.Types.ObjectId(testAliasId) }, (doc) => {
    return doc === null;
  });

  // ============================================================================
  // 09. USER PROFILE & BRANDING
  // ============================================================================
  console.log('\n--- [09] User Profile, Branding & Data Export ---');
  await api('Fetch logged-in broker profile', 'GET', '/api/v1/users/me', null, brokerToken);

  await api('Update broker profile phone and agency details', 'PATCH', '/api/v1/users/me', {
    phone: '+919876543200',
    agency: { name: 'LeadNivesh Premier Agency', city: 'Panipat' }
  }, brokerToken);
  await assertDb('Broker profile updated in users DB', 'users', { email: 'broker@leadnivesh.com' }, (doc) => {
    return doc && doc.agency?.name === 'LeadNivesh Premier Agency';
  });

  await api('Generate signed Cloudinary params for agency logo', 'POST', '/api/v1/users/me/logo/sign', null, brokerToken);
  await api('Export GDPR / user data backup', 'GET', '/api/v1/users/me/export', null, brokerToken);

  // ============================================================================
  // 10. PUBLIC ENDPOINTS & CONSUMER INQUIRIES
  // ============================================================================
  console.log('\n--- [10] Public Endpoints & Consumer Inquiries ---');

  // Create temporary property to test public inquiry
  const tempProp = await db.collection('properties').insertOne({
    userId: new mongoose.Types.ObjectId(brokerUserId),
    title: 'Public Flyer Demo Property',
    type: 'Floor',
    category: 'Residential',
    purpose: 'Sale',
    locality: 'Model Town',
    city: 'Panipat',
    size: { value: 180, unit: 'gaj' },
    priceDemandPaise: 750000000,
    status: 'available',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const tempPropId = tempProp.insertedId.toString();

  // 10.1 Consumer submits public inquiry
  const inqRes = await api('Consumer submits inquiry on property flyer', 'POST', '/api/v1/public/inquiries', {
    propertyId: tempPropId,
    name: 'Rohit Sharma (Consumer)',
    phone: '+919876543255',
    message: 'I am interested in visiting this property tomorrow afternoon.'
  }, null, 201);

  if (inqRes.ok && inqRes.data?.data?._id) {
    testInquiryId = inqRes.data.data._id;
  }
  await assertDb('Public inquiry recorded in DB', 'inquiries', { propertyId: new mongoose.Types.ObjectId(tempPropId) }, (doc) => {
    return doc && doc.name === 'Rohit Sharma (Consumer)' && doc.phoneE164 === '+919876543255';
  });

  // 10.2 Broker views inquiries
  await api('Broker views inquiries received on properties', 'GET', '/api/v1/inquiries', null, brokerToken);

  // 10.3 Public Landing Contact Form
  const contactRes = await api('Submit public contact lead from landing page', 'POST', '/api/v1/public/contact', {
    name: 'Sunita Verma',
    phone: '+919876543266',
    email: 'sunita@example.com',
    message: 'Need help finding a commercial showroom in Panipat.'
  }, null, 201);

  if (contactRes.ok && contactRes.data?.data?._id) {
    testContactId = contactRes.data.data._id;
  }
  await assertDb('Landing contact lead recorded in DB', 'contactleads', { email: 'sunita@example.com' }, (doc) => {
    return doc && doc.name === 'Sunita Verma';
  });

  // Clean up inquiry & contact lead & temp property
  if (testInquiryId) await db.collection('inquiries').deleteOne({ _id: new mongoose.Types.ObjectId(testInquiryId) });
  if (testContactId) await db.collection('contactleads').deleteOne({ _id: new mongoose.Types.ObjectId(testContactId) });
  await db.collection('properties').deleteOne({ _id: new mongoose.Types.ObjectId(tempPropId) });

  // ============================================================================
  // 11. TRASH SYSTEM
  // ============================================================================
  console.log('\n--- [11] Trash & Recovery Operations ---');
  await api('List trash bin contents', 'GET', '/api/v1/trash', null, brokerToken);

  // ============================================================================
  // 12. ADMIN MANAGEMENT & RBAC SECURITY DEFENSE
  // ============================================================================
  console.log('\n--- [12] Admin Management & RBAC Privilege Defense ---');

  // 12.1 Security Defense: Broker denied admin access (403)
  await api('RBAC Check: Broker calling admin routes rejected with 403', 'GET', '/api/v1/admin/users', null, brokerToken, 403);

  // 12.2 Admin lists users
  await api('Admin lists registered brokers', 'GET', '/api/v1/admin/users', null, adminToken);

  // 12.3 Admin updates broker plan tier to 'pro'
  await api('Admin upgrades broker plan tier to PRO', 'PATCH', `/api/v1/admin/users/${brokerUserId}/plan`, {
    tier: 'pro'
  }, adminToken);
  await assertDb('Broker tier upgraded to pro in DB', 'users', { _id: new mongoose.Types.ObjectId(brokerUserId) }, (doc) => {
    return doc && doc.plan?.tier === 'pro';
  });

  // 12.4 Admin downgrades back to 'trial'
  await api('Admin reverts broker plan tier to TRIAL', 'PATCH', `/api/v1/admin/users/${brokerUserId}/plan`, {
    tier: 'trial'
  }, adminToken);
  await assertDb('Broker tier reverted to trial in DB', 'users', { _id: new mongoose.Types.ObjectId(brokerUserId) }, (doc) => {
    return doc && doc.plan?.tier === 'trial';
  });

  // 12.5 Admin usage & system logs
  await api('Admin inspects platform usage counters', 'GET', '/api/v1/admin/usage', null, adminToken);
  await api('Admin inspects system-wide property inquiries', 'GET', '/api/v1/admin/inquiries', null, adminToken);
  await api('Admin inspects landing page contact leads', 'GET', '/api/v1/admin/contacts', null, adminToken);

  // ============================================================================
  // SUMMARY RESULTS
  // ============================================================================
  console.log('\n================================================================');
  console.log(`🏁 VERIFICATION SUITE COMPLETE`);
  console.log(`   Total Scenarios Tested : ${totalScenarios}`);
  console.log(`   Passed (API + DB)      : ${passedScenarios} (${Math.round((passedScenarios / totalScenarios) * 100)}%)`);
  console.log(`   Failed                 : ${failedScenarios}`);
  console.log('================================================================\n');

  await mongoose.disconnect();
  process.exit(failedScenarios > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
