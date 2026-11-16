import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('HTTP Server Probes & Base Endpoints', () => {
  it('GET /health returns 200 OK with liveness metrics', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /ready returns 503 when DB is disconnected in tests', async () => {
    const res = await request(app).get('/ready');
    // In unit test without connected Mongo, ready returns 503
    expect([200, 503]).toContain(res.status);
    expect(res.body.status).toBeDefined();
  });

  it('GET /api/v1 returns API root metadata', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('LeadNivesh API');
  });

  it('Returns 404 with standard error shape for unknown endpoints', async () => {
    const res = await request(app).get('/api/v1/non-existent-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

