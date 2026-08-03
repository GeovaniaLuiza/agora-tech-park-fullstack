import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createEmailRateLimiter, createRateLimiter } from '../src/middlewares/rateLimits.js';

describe('rate limit por IP', () => {
  it('retorna JSON padronizado, Retry-After e bloqueia após o limite', async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 60_000, limit: 2 }));
    app.post('/resource', (_req, res) => res.sendStatus(204));

    expect((await request(app).post('/resource')).status).toBe(204);
    expect((await request(app).post('/resource')).status).toBe(204);
    const limited = await request(app).post('/resource');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED', requestCreated: false });
    expect(limited.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.body.retryAfter).toBe(limited.body.retryAfterSeconds);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('rate limit público de reenvio por e-mail normalizado', () => {
  it('retorna 429 e Retry-After sem consultar a existência da conta', async () => {
    const app = express();
    app.use(express.json());
    app.post(
      '/resend',
      createEmailRateLimiter({ windowMs: 60_000, limit: 1 }),
      (_req, res) => res.status(202).json({ status: 'REQUEST_ACCEPTED' }),
    );

    expect((await request(app).post('/resend').send({ email: 'pessoa@test.com' })).status).toBe(202);
    const limited = await request(app).post('/resend').send({ email: 'pessoa@test.com' });
    const otherAddress = await request(app).post('/resend').send({ email: 'outra@test.com' });

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      code: 'RESEND_RATE_LIMITED',
      message: 'Aguarde antes de solicitar um novo envio.',
      nextAction: 'RETRY_LATER',
    });
    expect(limited.body.retryAfter).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(otherAddress.status).toBe(202);
  });
});
