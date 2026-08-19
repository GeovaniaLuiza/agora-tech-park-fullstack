import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/db/pool.js', () => ({
  query: vi.fn().mockRejectedValue(new Error('database unavailable in unit test')),
  databaseHealthCheck: vi.fn().mockResolvedValue('down'),
}));
vi.mock('../src/services/healthService.js', () => ({
  getHealth: vi.fn().mockResolvedValue({
    status: 'degraded',
    services: { api: 'up', database: 'up', email: 'down' },
  }),
}));

import app from '../src/app.js';

describe('observabilidade HTTP', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_TOKEN = 'metrics-test-token-with-enough-entropy';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.METRICS_TOKEN;
  });

  it('oculta métricas sem credencial em produção', async () => {
    const response = await request(app).get('/metrics');
    expect(response.status).toBe(404);
  });

  it('expõe métricas Prometheus com bearer token e request id', async () => {
    const response = await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${process.env.METRICS_TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.text).toContain('agora_http_requests_total');
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.text).not.toContain(process.env.METRICS_TOKEN);
  });
});
