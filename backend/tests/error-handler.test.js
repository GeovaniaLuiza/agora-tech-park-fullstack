import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../src/middlewares/errorHandler.js';

afterEach(() => vi.unstubAllEnvs());

function failingRequest(error, route = '/resource') {
  const app = express();
  app.get(route, (_req, _res, next) => next(error));
  app.use(errorHandler);
  return request(app).get(route);
}

describe('contrato HTTP de erros', () => {
  it.each([
    ['23505', 409, 'RESOURCE_CONFLICT'],
    ['23503', 422, 'INVALID_RELATIONSHIP'],
    ['22P02', 400, 'INVALID_VALUE'],
  ])('traduz erro PostgreSQL %s sem expor detalhes internos', async (code, status, expectedCode) => {
    const response = await failingRequest(Object.assign(new Error('internal-synthetic-detail'), { code }));
    expect(response.status).toBe(status);
    expect(response.body.code).toBe(expectedCode);
    expect(response.text).not.toContain('internal-synthetic-detail');
  });

  it.each([
    { code: 'ECONNREFUSED' },
    { errors: [null, { code: 'ETIMEDOUT' }, { code: 'ECONNREFUSED' }] },
  ])('retorna indisponibilidade para conexão recusada direta ou agregada', async (error) => {
    const response = await failingRequest(error);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it.each([
    ['/indicator-imports/upload', { type: 'entity.too.large' }, '10 MB'],
    ['/profile/avatar', { status: 413 }, '2 MB'],
  ])('informa o limite correto no upload %s', async (route, error, limit) => {
    const response = await failingRequest(error, route);
    expect(response.status).toBe(413);
    expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(response.body.message).toContain(limit);
  });

  it('preserva Retry-After e os detalhes controlados de rate limit', async () => {
    const response = await failingRequest({ status: 429, code: 'RATE_LIMIT', message: 'Aguarde', details: { retryAfterSeconds: 15 } });
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('15');
    expect(response.body).toEqual({ code: 'RATE_LIMIT', message: 'Aguarde', retryAfterSeconds: 15 });
  });

  it('oculta a mensagem de um erro inesperado em produção', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await failingRequest(new Error('internal-synthetic-detail'));
    expect(response.status).toBe(500);
    expect(response.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(response.body.message).toBeTruthy();
    expect(response.text).not.toContain('internal-synthetic-detail');
  });
});
