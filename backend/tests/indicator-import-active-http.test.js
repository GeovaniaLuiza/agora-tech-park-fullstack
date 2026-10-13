import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: 'ADMIN', latestDraft: vi.fn(), findBatch: vi.fn(), cancelBatch: vi.fn(), audit: vi.fn() }));
vi.mock('../src/middlewares/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { sub: 'manager', role: mocks.role }; next(); },
  authorize: () => (_req, _res, next) => next(),
}));
vi.mock('../src/repositories/indicatorImportRepository.js', () => ({
  latestDraft: mocks.latestDraft, findBatch: mocks.findBatch, cancelBatch: mocks.cancelBatch,
}));
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));
vi.mock('../src/services/indicatorCalculationService.js', () => ({ recompute: vi.fn() }));
import app from '../src/app.js';

const batch = { id: 'current', import_type: 'EVENTS', innovation_center_id: 'center', file_name: 'Eventos.xlsx',
  status: 'VALIDATED', draft: { items: [{ id: 'saved', included: true, reviewStatus: 'VALIDATED' }] } };

beforeEach(() => {
  vi.resetAllMocks(); mocks.role = 'ADMIN';
  mocks.findBatch.mockResolvedValue(batch);
  mocks.cancelBatch.mockImplementation(async (value, finalize) => {
    await finalize({ transaction: 'discard' });
    return { ...value, status: 'CANCELLED' };
  });
});

describe('draft e descarte via HTTP', () => {
  it.each(['VALIDATED', 'WITH_WARNINGS', 'REVIEW_PENDING'])('retorna o lote %s e as decisões salvas, independente do criador', async (status) => {
    mocks.latestDraft.mockResolvedValue({ ...batch, status });
    const response = await request(app).get('/api/indicator-imports/EVENTS/draft').query({ centerId: 'center' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 'current', status, fileName: 'Eventos.xlsx', draft: batch.draft });
    expect(mocks.latestDraft).toHaveBeenCalledWith({ importType: 'EVENTS', centerId: 'center' });
  });

  it('retorna null quando não existe lote ativo retomável', async () => {
    mocks.latestDraft.mockResolvedValue(undefined);
    const response = await request(app).get('/api/indicator-imports/EVENTS/draft').query({ centerId: 'center' });
    expect(response.status).toBe(200); expect(response.body).toBeNull();
  });

  it('descarta por POST e registra o responsável na mesma transação', async () => {
    const response = await request(app).post('/api/indicator-imports/batches/current/cancel').send({});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 'current', status: 'CANCELLED', draft: batch.draft });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: 'manager', action: 'INDICATOR_IMPORT_CANCELLED', entityId: 'current' }), { transaction: 'discard' });
  });

  it('propaga conflito com confirmação ou descarte concorrente', async () => {
    mocks.cancelBatch.mockRejectedValue(Object.assign(new Error('Lote não está mais ativo.'), { status: 409, code: 'IMPORT_NOT_CANCELLABLE' }));
    const response = await request(app).post('/api/indicator-imports/batches/current/cancel').send({});
    expect(response.status).toBe(409); expect(response.body.code).toBe('IMPORT_NOT_CANCELLABLE');
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('lote inexistente retorna 404 sem descartar', async () => {
    mocks.findBatch.mockResolvedValue(undefined);
    const response = await request(app).post('/api/indicator-imports/batches/missing/cancel').send({});
    expect(response.status).toBe(404); expect(mocks.cancelBatch).not.toHaveBeenCalled();
  });

  it.each(['EMPRESA', 'VISITANTE'])('perfil %s não pode consultar ou descartar', async (role) => {
    mocks.role = role;
    expect((await request(app).get('/api/indicator-imports/EVENTS/draft').query({ centerId: 'center' })).status).toBe(403);
    expect((await request(app).post('/api/indicator-imports/batches/current/cancel').send({})).status).toBe(403);
    expect(mocks.latestDraft).not.toHaveBeenCalled(); expect(mocks.cancelBatch).not.toHaveBeenCalled();
  });
});
