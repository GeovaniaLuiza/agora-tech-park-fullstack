import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/middlewares/rateLimits.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createGlobalRateLimiters: () => actual.createGlobalRateLimiters({
      global: { windowMs: 60_000, limit: 2 },
      globalRead: { windowMs: 60_000, limit: 30 },
    }),
  };
});
vi.mock('../src/middlewares/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { sub: 'manager', role: 'ADMIN' }; next(); },
  authorize: () => (_req, _res, next) => next(),
}));
vi.mock('../src/controllers/indicatorImportController.js', () => {
  const respond = (_req, res) => res.json({ ok: true });
  return Object.fromEntries(['options', 'exportStatus', 'exportWorkbook', 'draft', 'indicators', 'preview', 'batch', 'groupEvents', 'confirm', 'cancel', 'review'].map((name) => [name, respond]));
});
vi.mock('../src/controllers/indicatorManagementController.js', () => {
  const respond = (_req, res) => res.json([]);
  return Object.fromEntries(['centers', 'createCenter', 'updateCenter', 'metadata', 'definitions', 'createDefinition', 'updateDefinition', 'removeDefinition', 'values', 'history', 'saveValue', 'removeValue', 'applicability', 'records', 'createRecord', 'updateRecord', 'removeRecord'].map((name) => [name, respond]));
});

const loadingPaths = [
  '/api/indicator-management/innovation-centers',
  '/api/indicator-imports/options',
  '/api/indicator-imports/RESIDENTS/draft?centerId=center',
  '/api/indicator-imports/batches/current',
];

describe('limites independentes na aplicação HTTP', () => {
  it.each([
    ['post', '/api/indicator-imports/RESIDENTS/preview'],
    ['put', '/api/indicator-imports/batches/current/review'],
    ['post', '/api/indicator-imports/batches/current/cancel'],
    ['post', '/api/indicator-imports/batches/current/confirm'],
  ])('carregamento não consome ações sensíveis e continua disponível após limitar %s %s', async (method, path) => {
    vi.resetModules();
    const { default: app } = await import('../src/app.js');
    for (let load = 0; load < 3; load += 1) {
      for (const loadingPath of loadingPaths) expect((await request(app).get(loadingPath)).status).toBe(200);
    }
    expect((await request(app)[method](path)).status).toBe(200);
    expect((await request(app)[method](path)).status).toBe(200);
    const blocked = await request(app)[method](path);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    for (const loadingPath of loadingPaths) expect((await request(app).get(loadingPath)).status).toBe(200);
  });
});
