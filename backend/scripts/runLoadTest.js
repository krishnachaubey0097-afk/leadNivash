import os from 'os';
import { performance } from 'perf_hooks';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-test-suite': 'leadnivesh-internal-test', // Bypass rate limiters for load benchmarking
};

// Test credentials
const BROKER_CREDENTIALS = {
  email: 'broker@leadnivesh.com',
  password: 'Broker@123456',
};

// Metrics tracking helper
class MetricsCollector {
  constructor(name) {
    this.name = name;
    this.latencies = [];
    this.statusCodes = {};
    this.errors = 0;
    this.total = 0;
    this.startTime = 0;
    this.endTime = 0;
  }

  record(durationMs, statusCode, error = null) {
    this.total++;
    this.latencies.push(durationMs);
    this.statusCodes[statusCode] = (this.statusCodes[statusCode] || 0) + 1;
    if (error || statusCode >= 400) {
      this.errors++;
    }
  }

  start() {
    this.startTime = performance.now();
  }

  stop() {
    this.endTime = performance.now();
  }

  getStats() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const count = sorted.length;
    if (count === 0) return { count: 0, errorRate: 0 };

    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = sorted[0];
    const max = sorted[count - 1];
    const p50 = sorted[Math.floor(count * 0.5)];
    const p90 = sorted[Math.floor(count * 0.9)];
    const p95 = sorted[Math.floor(count * 0.95)];
    const p99 = sorted[Math.floor(count * 0.99)];
    const totalDurationSec = (this.endTime - this.startTime) / 1000;
    const rps = totalDurationSec > 0 ? (count / totalDurationSec).toFixed(2) : '0';
    const errorRate = ((this.errors / count) * 100).toFixed(2);

    return {
      name: this.name,
      total: count,
      errors: this.errors,
      errorRate: `${errorRate}%`,
      rps,
      min: `${min.toFixed(2)}ms`,
      avg: `${avg.toFixed(2)}ms`,
      p50: `${p50.toFixed(2)}ms`,
      p90: `${p90.toFixed(2)}ms`,
      p95: `${p95.toFixed(2)}ms`,
      p99: `${p99.toFixed(2)}ms`,
      max: `${max.toFixed(2)}ms`,
      statusCodes: this.statusCodes,
    };
  }
}

// Memory and CPU snapshot helper
function getSystemSnapshot() {
  const mem = process.memoryUsage();
  return {
    rssMb: (mem.rss / 1024 / 1024).toFixed(2),
    heapUsedMb: (mem.heapUsed / 1024 / 1024).toFixed(2),
    heapTotalMb: (mem.heapTotal / 1024 / 1024).toFixed(2),
    freeMemMb: (os.freemem() / 1024 / 1024).toFixed(2),
    totalMemMb: (os.totalmem() / 1024 / 1024).toFixed(2),
    cpus: os.cpus().length,
  };
}

async function loginBroker() {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(BROKER_CREDENTIALS),
  });
  if (!res.ok) {
    throw new Error(`Broker login failed with status ${res.status}`);
  }
  const json = await res.json();
  return json.data.accessToken;
}

// Simulated User Request Workload
async function executeUserJourney(token, collector) {
  const journey = [
    { name: 'Health Probe', url: `${BASE_URL}/health`, method: 'GET', auth: false },
    { name: 'Dashboard Data', url: `${BASE_URL}/api/v1/dashboard/today`, method: 'GET', auth: true },
    { name: 'List Properties', url: `${BASE_URL}/api/v1/properties?limit=10`, method: 'GET', auth: true },
    { name: 'List Buyers', url: `${BASE_URL}/api/v1/buyers?limit=10`, method: 'GET', auth: true },
    {
      name: 'Smart Match Evaluation',
      url: `${BASE_URL}/api/v1/matches/quick`,
      method: 'POST',
      auth: true,
      body: {
        property: {
          type: 'Plot',
          purpose: 'Sale',
          localityKey: 'model_town',
          priceDemandPaise: 500000000,
          sizeGaj: 150,
          status: 'available',
        },
        buyer: {
          purpose: 'Sale',
          types: ['Plot'],
          localities: [{ key: 'model_town', display: 'Model Town' }],
          anyLocality: false,
          budget: { minPaise: 400000000, maxPaise: 550000000 },
        },
        tolerancePct: 10,
      },
    },
  ];

  for (const step of journey) {
    const t0 = performance.now();
    let status = 0;
    let err = null;
    try {
      const h = { ...HEADERS };
      if (step.auth && token) {
        h['Authorization'] = `Bearer ${token}`;
      }
      const opts = { method: step.method, headers: h };
      if (step.body) {
        opts.body = JSON.stringify(step.body);
      }
      const res = await fetch(step.url, opts);
      status = res.status;
      await res.text();
    } catch (e) {
      status = 500;
      err = e;
    } finally {
      const dur = performance.now() - t0;
      collector.record(dur, status, err);
    }
  }
}

// Concurrency runner
async function runConcurrentPhase(phaseName, concurrentUsers, totalJourneys, token) {
  console.log(`\n============================================================`);
  console.log(`🚀 Starting Phase: ${phaseName} | Concurrent Users: ${concurrentUsers} | Total Journeys: ${totalJourneys}`);
  console.log(`============================================================`);

  const memBefore = getSystemSnapshot();
  console.log(`Initial Memory: RSS ${memBefore.rssMb} MB | Heap Used: ${memBefore.heapUsedMb} MB`);

  const collector = new MetricsCollector(phaseName);
  collector.start();

  let journeysRemaining = totalJourneys;
  const worker = async () => {
    while (journeysRemaining > 0) {
      journeysRemaining--;
      await executeUserJourney(token, collector);
    }
  };

  const pool = Array.from({ length: concurrentUsers }, () => worker());
  await Promise.all(pool);

  collector.stop();
  const memAfter = getSystemSnapshot();
  const stats = collector.getStats();

  console.log(`\n--- Results for ${phaseName} ---`);
  console.table({
    'Total HTTP Requests': stats.total,
    'Failed Requests': stats.errors,
    'Error Rate': stats.errorRate,
    'Throughput (RPS)': stats.rps,
    'Latency Min': stats.min,
    'Latency Avg': stats.avg,
    'Latency p50 (Median)': stats.p50,
    'Latency p90': stats.p90,
    'Latency p95': stats.p95,
    'Latency p99': stats.p99,
    'Latency Max': stats.max,
    'Heap Used Delta': `${(memAfter.heapUsedMb - memBefore.heapUsedMb).toFixed(2)} MB`,
    'Status Codes': JSON.stringify(stats.statusCodes),
  });

  return { stats, memBefore, memAfter };
}

// Master execution
async function main() {
  console.log(`\n============================================================`);
  console.log(`🔥 LEADNIVESH PERFORMANCE & LOAD TEST SUITE (100 CONCURRENT USERS)`);
  console.log(`Target: ${BASE_URL} | Hardware Cores: ${os.cpus().length}`);
  console.log(`============================================================`);

  try {
    console.log(`1. Authenticating test broker...`);
    const t0 = performance.now();
    const token = await loginBroker();
    const authMs = performance.now() - t0;
    console.log(`✅ Authentication successful (${authMs.toFixed(2)}ms)`);

    // Phase 1: Baseline Concurrency (10 concurrent users, 50 journeys = 250 requests)
    const p1 = await runConcurrentPhase('Phase 1: Baseline (10 VUs)', 10, 50, token);

    // Phase 2: Moderate Concurrency (50 concurrent users, 100 journeys = 500 requests)
    const p2 = await runConcurrentPhase('Phase 2: Moderate Load (50 VUs)', 50, 100, token);

    // Phase 3: Peak Stress Concurrency (100 concurrent users, 200 journeys = 1,000 requests)
    const p3 = await runConcurrentPhase('Phase 3: Peak Load (100 VUs)', 100, 200, token);

    console.log(`\n============================================================`);
    console.log(`🎉 ALL 3 PHASES COMPLETED SUCCESSFULLY!`);
    console.log(`============================================================`);
  } catch (err) {
    console.error(`❌ Load test encountered an error:`, err);
    process.exit(1);
  }
}

main();
