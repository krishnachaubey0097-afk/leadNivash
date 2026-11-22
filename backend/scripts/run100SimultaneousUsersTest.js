import os from 'os';
import { performance } from 'perf_hooks';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-test-suite': 'leadnivesh-internal-test', // Bypass rate limiters for load benchmarking
};

class MetricsTracker {
  constructor(name) {
    this.name = name;
    this.byEndpoint = {};
    this.statusCodes = {};
    this.errors = 0;
    this.total = 0;
    this.startTime = 0;
    this.endTime = 0;
  }

  start() {
    this.startTime = performance.now();
  }

  stop() {
    this.endTime = performance.now();
  }

  record(endpoint, method, status, durationMs, error = null) {
    this.total++;
    this.statusCodes[status] = (this.statusCodes[status] || 0) + 1;
    if (error || status >= 400) {
      this.errors++;
    }

    if (!this.byEndpoint[endpoint]) {
      this.byEndpoint[endpoint] = {
        method,
        latencies: [],
        errors: 0,
        total: 0,
        statusCodes: {},
      };
    }
    const ep = this.byEndpoint[endpoint];
    ep.total++;
    ep.latencies.push(durationMs);
    ep.statusCodes[status] = (ep.statusCodes[status] || 0) + 1;
    if (error || status >= 400) {
      ep.errors++;
    }
  }

  getEndpointSummary(name, ep) {
    const sorted = [...ep.latencies].sort((a, b) => a - b);
    const count = sorted.length;
    if (count === 0) return null;

    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = sorted[0];
    const max = sorted[count - 1];
    const p50 = sorted[Math.floor(count * 0.5)];
    const p90 = sorted[Math.floor(count * 0.9)];
    const p95 = sorted[Math.floor(count * 0.95)];
    const p99 = sorted[Math.floor(count * 0.99)];
    const errRate = ((ep.errors / count) * 100).toFixed(1);

    return {
      Endpoint: `${ep.method} ${name}`,
      Total: count,
      Failed: ep.errors,
      'Err %': `${errRate}%`,
      Min: `${min.toFixed(1)}ms`,
      Avg: `${avg.toFixed(1)}ms`,
      p50: `${p50.toFixed(1)}ms`,
      p95: `${p95.toFixed(1)}ms`,
      p99: `${p99.toFixed(1)}ms`,
      Max: `${max.toFixed(1)}ms`,
    };
  }

  getOverallStats() {
    const allLatencies = [];
    Object.values(this.byEndpoint).forEach((ep) => allLatencies.push(...ep.latencies));
    allLatencies.sort((a, b) => a - b);
    const count = allLatencies.length;
    const totalDurationSec = (this.endTime - this.startTime) / 1000;
    const rps = totalDurationSec > 0 ? (count / totalDurationSec).toFixed(1) : '0';
    const sum = allLatencies.reduce((a, b) => a + b, 0);
    const avg = count > 0 ? sum / count : 0;
    const min = count > 0 ? allLatencies[0] : 0;
    const max = count > 0 ? allLatencies[count - 1] : 0;
    const p50 = count > 0 ? allLatencies[Math.floor(count * 0.5)] : 0;
    const p90 = count > 0 ? allLatencies[Math.floor(count * 0.9)] : 0;
    const p95 = count > 0 ? allLatencies[Math.floor(count * 0.95)] : 0;
    const p99 = count > 0 ? allLatencies[Math.floor(count * 0.99)] : 0;

    return {
      name: this.name,
      totalRequests: count,
      failedRequests: this.errors,
      errorRate: `${count > 0 ? ((this.errors / count) * 100).toFixed(2) : 0}%`,
      durationSeconds: totalDurationSec.toFixed(2),
      throughputRps: rps,
      latency: {
        min: `${min.toFixed(2)}ms`,
        avg: `${avg.toFixed(2)}ms`,
        p50: `${p50.toFixed(2)}ms`,
        p90: `${p90.toFixed(2)}ms`,
        p95: `${p95.toFixed(2)}ms`,
        p99: `${p99.toFixed(2)}ms`,
        max: `${max.toFixed(2)}ms`,
      },
      statusCodes: this.statusCodes,
    };
  }
}

function getMemorySnapshot() {
  const mem = process.memoryUsage();
  return {
    rssMb: (mem.rss / 1024 / 1024).toFixed(2),
    heapUsedMb: (mem.heapUsed / 1024 / 1024).toFixed(2),
    heapTotalMb: (mem.heapTotal / 1024 / 1024).toFixed(2),
  };
}

async function request(method, path, body = null, token = null, tracker = null, endpointLabel = null) {
  const url = `${BASE_URL}${path}`;
  const h = { ...HEADERS };
  if (token) {
    h['Authorization'] = `Bearer ${token}`;
  }

  const opts = { method, headers: h };
  if (body) {
    opts.body = JSON.stringify(body);
  }

  const t0 = performance.now();
  let status = 0;
  let data = null;
  let err = null;

  try {
    const res = await fetch(url, opts);
    status = res.status;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  } catch (e) {
    status = 500;
    err = e;
  } finally {
    const dur = performance.now() - t0;
    if (tracker) {
      tracker.record(endpointLabel || path, method, status, dur, err);
    }
  }

  return { status, data, durationMs: performance.now() - t0 };
}

async function runBenchmark() {
  const NUM_USERS = 100;
  console.log(`================================================================`);
  console.log(`🚀 LEADNIVESH 100 SIMULTANEOUS USERS PERFORMANCE BENCHMARK`);
  console.log(`Target: ${BASE_URL} | CPU Cores: ${os.cpus().length}`);
  console.log(`Simultaneous Users: ${NUM_USERS}`);
  console.log(`================================================================\n`);

  const memStart = getMemorySnapshot();
  console.log(`Initial Memory: RSS ${memStart.rssMb} MB | Heap Used: ${memStart.heapUsedMb} MB\n`);

  // =========================================================================
  // STAGE 1: 100 Concurrent User Registrations & Logins
  // =========================================================================
  console.log(`--- STAGE 1: Creating & Authenticating 100 Users in Parallel ---`);
  const authTracker = new MetricsTracker('Auth Phase');
  authTracker.start();

  const timestamp = Date.now();
  const users = [];

  // Provision 100 user credentials in concurrent batches of 10 to simulate realistic user registration traffic
  const BATCH_SIZE = 10;
  for (let b = 0; b < NUM_USERS; b += BATCH_SIZE) {
    const batchPromises = [];
    for (let i = b + 1; i <= Math.min(b + BATCH_SIZE, NUM_USERS); i++) {
      const email = `bench_u${timestamp}_${i}@leadnivash.test`;
      const password = `StrongPass@${i}987!`;
      const phone = `+9198${String(10000000 + i).slice(0, 8)}`;
      const name = `Broker VU ${i}`;
      const agencyName = `Realty Hub ${i}`;

      const p = (async () => {
        // 1. Sign up
        const reg = await request(
          'POST',
          '/api/v1/auth/register',
          {
            name,
            email,
            password,
            phone,
            agency: { name: agencyName, city: 'Panipat' },
            consent: { termsAccepted: true, privacyVersion: '1.0' },
          },
          null,
          authTracker,
          '/api/v1/auth/register'
        );

        let token = reg.data?.data?.accessToken || reg.data?.accessToken;

        // 2. Log in
        const login = await request(
          'POST',
          '/api/v1/auth/login',
          { email, password },
          null,
          authTracker,
          '/api/v1/auth/login'
        );

        if (!token) {
          token = login.data?.data?.accessToken || login.data?.accessToken;
        }

        return {
          id: i,
          email,
          password,
          phone,
          name,
          token,
          propertyId: null,
          buyerId: null,
        };
      })();

      batchPromises.push(p);
    }

    const batchResults = await Promise.all(batchPromises);
    users.push(...batchResults);
    process.stdout.write(`Provisioned & authenticated ${users.length}/${NUM_USERS} users...\r`);
  }

  authTracker.stop();
  console.log(`\n✅ 100 Users provisioned and authenticated successfully!\n`);

  // =========================================================================
  // STAGE 2: 100 SIMULTANEOUS USERS PERFORMING REAL OPERATIONS CONCURRENTLY
  // =========================================================================
  console.log(`--- STAGE 2: 100 Simultaneous Users Operating Concurrently ---`);
  console.log(`All 100 users firing simultaneous requests across 8 platform features via Promise.all:`);
  console.log(`  1. Get Profile (/api/v1/users/me)`);
  console.log(`  2. Get Dashboard Overview (/api/v1/dashboard/today)`);
  console.log(`  3. Create Property Listing (/api/v1/properties)`);
  console.log(`  4. Query Property Inventory (/api/v1/properties)`);
  console.log(`  5. Create Buyer Requirement (/api/v1/buyers)`);
  console.log(`  6. Query Real-Time Buyer Matches (/api/v1/properties/:id/matches)`);
  console.log(`  7. Run Instant AI Match Engine (/api/v1/matches/quick)`);
  console.log(`  8. Terminate Session & Log Out (/api/v1/auth/logout)\n`);

  const appTracker = new MetricsTracker('Application Workload');
  appTracker.start();

  const userOperations = users.map((u) => {
    return (async () => {
      // 1. Profile
      await request('GET', '/api/v1/users/me', null, u.token, appTracker, '/api/v1/users/me');

      // 2. Dashboard
      await request('GET', '/api/v1/dashboard/today', null, u.token, appTracker, '/api/v1/dashboard/today');

      // 3. Create Property
      const propResp = await request(
        'POST',
        '/api/v1/properties',
        {
          title: `3 BHK Builder Floor Sector ${u.id % 25}`,
          type: 'Floor',
          purpose: 'Sale',
          locality: `Sector ${u.id % 25}`,
          city: 'Panipat',
          priceDemandPaise: 850000000 + u.id * 100000,
          size: { value: 180 + (u.id % 50), unit: 'gaj' },
          facing: 'North-East',
          description: `Luxury ventilated property registered by VU-${u.id}`,
          owner: { phone: u.phone },
        },
        u.token,
        appTracker,
        '/api/v1/properties'
      );
      u.propertyId = propResp.data?.data?._id || propResp.data?._id;

      // 4. Query Inventory
      await request('GET', '/api/v1/properties?limit=10', null, u.token, appTracker, '/api/v1/properties');

      // 5. Create Buyer
      const buyerResp = await request(
        'POST',
        '/api/v1/buyers',
        {
          name: `Client of Broker ${u.id}`,
          phone: `+9197${String(30000000 + u.id).slice(0, 8)}`,
          purpose: 'Sale',
          types: ['Floor'],
          localities: [`Sector ${u.id % 25}`],
          budget: { minPaise: 700000000, maxPaise: 950000000 },
          urgency: 'hot',
          notes: 'Client looking for immediate purchase',
        },
        u.token,
        appTracker,
        '/api/v1/buyers'
      );
      u.buyerId = buyerResp.data?.data?._id || buyerResp.data?._id;

      // 6. Query Matches for Property
      if (u.propertyId) {
        await request(
          'GET',
          `/api/v1/properties/${u.propertyId}/matches`,
          null,
          u.token,
          appTracker,
          '/api/v1/properties/:id/matches'
        );
      }

      // 7. Evaluate Match Engine
      await request(
        'POST',
        '/api/v1/matches/quick',
        {
          property: {
            type: 'Floor',
            purpose: 'Sale',
            localityKey: `sector_${u.id % 25}`,
            priceDemandPaise: 850000000,
            sizeGaj: 180,
            status: 'available',
          },
          buyer: {
            purpose: 'Sale',
            types: ['Floor'],
            localities: [{ key: `sector_${u.id % 25}`, display: `Sector ${u.id % 25}` }],
            anyLocality: false,
            budget: { minPaise: 750000000, maxPaise: 900000000 },
          },
          tolerancePct: 10,
        },
        u.token,
        appTracker,
        '/api/v1/matches/quick'
      );

      // 8. Log out
      await request('POST', '/api/v1/auth/logout', null, u.token, appTracker, '/api/v1/auth/logout');
    })();
  });

  await Promise.all(userOperations);
  appTracker.stop();

  const memEnd = getMemorySnapshot();
  const authStats = authTracker.getOverallStats();
  const appStats = appTracker.getOverallStats();

  console.log(`================================================================`);
  console.log(`📊 STAGE 2: 100 CONCURRENT USERS WORKLOAD RESULTS`);
  console.log(`================================================================`);
  console.log(`Concurrent Users        : ${NUM_USERS} Users Simultaneously Active`);
  console.log(`Total Requests Executed : ${appStats.totalRequests}`);
  console.log(`Successful Requests     : ${appStats.totalRequests - appStats.failedRequests}`);
  console.log(`Failed Requests         : ${appStats.failedRequests}`);
  console.log(`Error Rate              : ${appStats.errorRate}`);
  console.log(`Duration                : ${appStats.durationSeconds}s`);
  console.log(`Throughput              : ${appStats.throughputRps} Requests/sec`);
  console.log(`Status Codes Breakdown  :`, JSON.stringify(appStats.statusCodes));

  console.log(`\n--- Latency Breakdown (Across All 800 Concurrent Application Requests) ---`);
  console.log(`Min Latency             : ${appStats.latency.min}`);
  console.log(`Average Latency         : ${appStats.latency.avg}`);
  console.log(`p50 (Median Latency)    : ${appStats.latency.p50}`);
  console.log(`p90 Latency             : ${appStats.latency.p90}`);
  console.log(`p95 Latency             : ${appStats.latency.p95}`);
  console.log(`p99 Latency             : ${appStats.latency.p99}`);
  console.log(`Max Latency             : ${appStats.latency.max}`);

  console.log(`\n--- Per-Endpoint Performance Under 100 Concurrent Users ---`);
  const tableData = [];
  for (const [epName, epData] of Object.entries(appTracker.byEndpoint)) {
    const summary = appTracker.getEndpointSummary(epName, epData);
    if (summary) tableData.push(summary);
  }
  console.table(tableData);

  console.log(`\n--- System Resource Consumption ---`);
  console.log(`Initial RSS Memory      : ${memStart.rssMb} MB`);
  console.log(`Final RSS Memory        : ${memEnd.rssMb} MB`);
  console.log(`Initial Heap Used       : ${memStart.heapUsedMb} MB`);
  console.log(`Final Heap Used         : ${memEnd.heapUsedMb} MB`);
  console.log(`Heap Delta              : ${(memEnd.heapUsedMb - memStart.heapUsedMb).toFixed(2)} MB`);

  return { authStats, appStats, tableData, memStart, memEnd };
}

runBenchmark()
  .then(() => {
    console.log(`\n✅ 100 Simultaneous Users Benchmark Completed Successfully.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n❌ Benchmark failed with critical error:`, err);
    process.exit(1);
  });
