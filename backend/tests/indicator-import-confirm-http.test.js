import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findBatch: vi.fn(), replaceBatchRecords: vi.fn(), markImported: vi.fn(), recompute: vi.fn() }));
vi.mock('../src/middlewares/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { sub: 'admin-1', role: 'ADMIN' }; next(); },
  authorize: () => (_req, _res, next) => next(),
}));
vi.mock('../src/repositories/indicatorImportRepository.js', () => ({
  findBatch: mocks.findBatch, replaceBatchRecords: mocks.replaceBatchRecords, markImported: mocks.markImported,
}));
vi.mock('../src/services/indicatorCalculationService.js', () => ({ recompute: mocks.recompute }));
vi.mock('../src/repositories/auditRepository.js', () => ({ record: vi.fn() }));
import app from '../src/app.js';

let stored;
const client = { transaction: 'confirmation' };
const endpoint = '/api/indicator-imports/batches/batch-1/confirm';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findBatch.mockImplementation(async () => stored);
  mocks.replaceBatchRecords.mockImplementation(async (_batch, _records, _userId, finalize) => finalize(client));
  mocks.markImported.mockImplementation(async (_id, { summary }) => {
    stored = { ...stored, status: 'IMPORTED', summary };
    return stored;
  });
});

function batch(type) {
  const items = Array.from({ length: 235 }, (_, index) => ({
    id: `item-${index}`, sourceRows: [index + 2], name: `Registro ${index}`, included: true,
    reviewStatus: 'VALIDATED', validationStatus: index < 192 ? 'VALID' : 'WARNING', issues: [],
    duplicateGroup: index < 192 ? null : 'duplicate',
    location: type === 'EVENTS' ? 'Auditório' : 'HUB', startAt: '2026-03-15T09:00:00.000Z',
    participants: null, participatingCompanies: null, rooms: ['201'], startDate: '2026-01-01',
    contracts: [{ sourceRow: index + 2, eligibleBlock: true, startDate: '2026-01-01', endDate: null }],
  }));
  stored = { id: 'batch-1', import_type: type, innovation_center_id: 'center-1', year: 2026,
    status: 'VALIDATED', draft: { items }, summary: {}, warnings: [] };
  return stored;
}

describe.each(['EVENTS', 'RESIDENTS'])('POST de confirmação final de %s', (type) => {
  it('recebe POST, aceita os 235 incluídos, recalcula indicadores e retorna IMPORTED com HTTP 200', async () => {
    batch(type);
    const response = await request(app).post(endpoint).send({});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'IMPORTED', importType: type,
      summary: { included: 235, processed: 235, indicatorsUpdated: true, ignored: 0 } });
    expect(mocks.replaceBatchRecords).toHaveBeenCalledWith(expect.any(Object),
      expect.arrayContaining([expect.objectContaining({ recordType: type === 'EVENTS' ? 'EVENT' : 'RESIDENT_COMPANY' })]),
      'admin-1', expect.any(Function));
    expect(mocks.replaceBatchRecords.mock.calls[0][1]).toHaveLength(235);
    expect(mocks.recompute).toHaveBeenCalledWith('center-1', 2026, 'admin-1', client, expect.any(Array));
    expect(mocks.markImported).toHaveBeenCalledWith('batch-1', expect.objectContaining({ imported: 235, ignored: 0 }), client);
    expect(mocks.recompute.mock.invocationCallOrder[0]).toBeLessThan(mocks.markImported.mock.invocationCallOrder[0]);
    expect(stored.status).toBe('IMPORTED');
  });

  it('retorna 422 sem incluídos e não grava registros ou indicadores', async () => {
    batch(type).draft.items.forEach((item) => { item.included = false; });
    const response = await request(app).post(endpoint).send({});
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('NO_INCLUDED_RECORDS');
    expect(mocks.replaceBatchRecords).not.toHaveBeenCalled();
    expect(mocks.recompute).not.toHaveBeenCalled();
    expect(stored.status).toBe('VALIDATED');
  });

  it('não conta registros incluídos marcados como ignorados ou excluídos', async () => {
    batch(type).draft.items.forEach((item, index) => { if (index % 2) item.ignored = true; else item.reviewStatus = 'EXCLUDED'; });
    const response = await request(app).post(endpoint).send({});
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('NO_INCLUDED_RECORDS');
    expect(mocks.replaceBatchRecords).not.toHaveBeenCalled();
  });

  it('retorna 409 ao tentar confirmar lote já importado', async () => {
    batch(type).status = 'IMPORTED';
    const response = await request(app).post(endpoint).send({});
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('IMPORT_ALREADY_CONFIRMED');
    expect(mocks.replaceBatchRecords).not.toHaveBeenCalled();
  });

  it('propaga falha de cálculo e não marca o lote como IMPORTED', async () => {
    batch(type);
    mocks.recompute.mockRejectedValueOnce(new Error('Falha no cálculo dos indicadores'));
    const response = await request(app).post(endpoint).send({});
    expect(response.status).toBe(500);
    expect(response.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(mocks.markImported).not.toHaveBeenCalled();
    expect(stored.status).toBe('VALIDATED');
  });
});
