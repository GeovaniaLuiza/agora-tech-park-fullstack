import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { XLSX_MIME } from '../src/domain/indicatorImportCatalog.js';

afterEach(() => vi.unstubAllEnvs());

function failingRequest(error, route = '/resource', method = 'get', contentType) {
  const app = express();
  app[method](route.split('?')[0], (_req, _res, next) => next(error));
  app.use(errorHandler);
  const response = request(app)[method](route);
  return contentType ? response.set('Content-Type', contentType) : response;
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
    ['/api/indicator-imports/EVENTS/preview?centerId=1', { type: 'entity.too.large' }, '200 MB', 'post', XLSX_MIME],
    ['/api/indicator-imports/RESIDENTS/preview', { status: 413 }, '200 MB', 'post', XLSX_MIME],
    ['/api/auth/me/avatar', { status: 413 }, '2 MB', 'patch', 'application/json'],
  ])('informa o limite correto no upload %s', async (route, error, limit, method, contentType) => {
    const response = await failingRequest(error, route, method, contentType);
    expect(response.status).toBe(413);
    expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(response.body.message).toContain(limit);
  });

  it.each(['EVENTS', 'RESIDENTS'])('não chama JSON excessivo de XLSX grande no preview de %s', async (type) => {
    const response = await failingRequest({ type: 'entity.too.large' }, `/api/indicator-imports/${type}/preview`, 'post', 'application/json');
    expect(response.body.code).toBe('IMPORT_REQUEST_TOO_LARGE');
    expect(response.body.message).not.toContain('A planilha excede');
  });

  it.each([
    ['application/json', 'O corpo JSON'],
    ['application/octet-stream', 'O corpo da requisição'],
  ])('classifica outros HTTP 413 de %s sem mencionar planilha ou imagem', async (contentType, message) => {
    const response = await failingRequest({ status: 413 }, '/api/resource', 'post', contentType);
    expect(response.status).toBe(413);
    expect(response.body.message).toContain(message);
    expect(response.body.message).not.toMatch(/planilha|imagem/);
  });

  it.each([
    ['/api/indicator-imports/batches/batch-1/review', 'put'],
    ['/api/indicator-imports/batches/batch-1/confirm', 'post'],
    ['/api/indicator-imports/EVENTS/draft', 'get'],
    ['/api/indicator-imports/RESIDENTS/draft', 'get'],
  ])('não confunde o limite da requisição %s com o tamanho do XLSX', async (route, method) => {
    const response = await failingRequest({ type: 'entity.too.large' }, route, method);
    expect(response.status).toBe(413);
    expect(response.body.code).toBe('IMPORT_REQUEST_TOO_LARGE');
    expect(response.body.message).not.toContain('A planilha excede');
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
