import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/middlewares/rateLimits.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, RATE_LIMIT_CONFIG: { ...actual.RATE_LIMIT_CONFIG, login: { windowMs: 900_000, limit: 3 } },
    createGlobalRateLimiters: () => actual.createGlobalRateLimiters({ global: { windowMs: 900_000, limit: 30 }, globalRead: { windowMs: 900_000, limit: 100 } }) };
});
vi.mock('../src/controllers/authController.js', () => {
  const respond = (_req, res) => res.json({ ok: true });
  return { login: (req, res) => res.status(req.body.password === 'Correct123' ? 200 : 401).json({ ok: true }),
    logout: respond, me: respond, registerRequest: respond, resendVerification: respond, verifyEmail: respond,
    forgotPassword: respond, resetPassword: respond, updateAvatar: respond };
});
vi.mock('../src/middlewares/auth.js', () => ({ authenticate: (_req, _res, next) => next(), authorize: () => (_req, _res, next) => next() }));
vi.mock('../src/controllers/indicatorImportController.js', () => {
  const respond = (_req, res) => res.json({ ok: true });
  return Object.fromEntries(['options', 'exportStatus', 'exportWorkbook', 'draft', 'indicators', 'preview', 'batch', 'groupEvents', 'confirm', 'cancel', 'review'].map((name) => [name, respond]));
});

describe('limite de login durante importação', () => {
  it('leituras/importações não contam no limiter de login e sucesso não zera falhas anteriores', async () => {
    const { default: app } = await import('../src/app.js');
    for (let index = 0; index < 5; index += 1) {
      expect((await request(app).get('/api/auth/me')).status).toBe(200);
      expect((await request(app).get('/api/indicator-imports/RESIDENTS/draft')).status).toBe(200);
      expect((await request(app).post('/api/indicator-imports/EVENTS/preview')).status).toBe(200);
      expect((await request(app).put('/api/indicator-imports/batches/current/review')).status).toBe(200);
    }
    const login = (password) => request(app).post('/api/auth/login').send({ email: 'manager@test.invalid', password });
    expect((await login('Wrong123')).status).toBe(401);
    expect((await login('Correct123')).status).toBe(200);
    expect((await login('Wrong123')).status).toBe(401);
    expect((await login('Wrong123')).status).toBe(401);
    const blocked = await login('Correct123');
    expect(blocked.status).toBe(429);
    expect(blocked.body.rateLimitScope).toBe('LOGIN');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
  it('orçamento global de gravação pode bloquear login mesmo sem tentativas prévias', async () => {
    vi.resetModules();
    const { default: app } = await import('../src/app.js');
    for (let index = 0; index < 30; index += 1) expect((await request(app).post('/api/indicator-imports/batches/current/review-not-found')).status).toBe(404);
    const blocked = await request(app).post('/api/auth/login').send({ email: 'manager@test.invalid', password: 'Correct123' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.rateLimitScope).toBe('GLOBAL_WRITE');
    expect((await request(app).get('/api/auth/me')).status).toBe(200);
  });
});
