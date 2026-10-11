import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import rows from './fixtures/event-homologation-rows.json' with { type: 'json' };

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), listDefinitions: vi.fn() }));
vi.mock('../src/db/pool.js', () => ({ query: mocks.query, pool: { connect: mocks.connect } }));
vi.mock('../src/repositories/indicatorManagementRepository.js', () => ({ listDefinitions: mocks.listDefinitions }));
vi.mock('../src/middlewares/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { role: 'ADMIN' }; next(); },
  authorize: () => (_req, _res, next) => next(),
}));
import routes from '../src/routes/indicatorImportRoutes.js';

const app = express();
app.use('/api/indicator-imports', routes);
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code }));
const records = rows.map(([name, event_at, location, theme, mode, subtype, participants, participating_companies], index) => ({
  id: `event-${index + 1}`, import_batch_id: 'confirmed-batch', innovation_center_id: 'center-1',
  active: true, deleted_at: null, record_type: 'EVENT', name, event_at, location, theme, mode, subtype, participants, participating_companies,
}));
const monthly = [0, 0, 0, 0, 0, 0, 235, 0, 0, 0, 0, 0];
let snapshot;
beforeEach(() => {
  vi.resetAllMocks();
  snapshot = structuredClone(records);
  mocks.listDefinitions.mockResolvedValue([{ id: 'events', code: 'EVENTOS_REALIZADOS', value_type: 'INTEGER', calculation_type: 'AUTOMATIC', annual_aggregation: 'SUM' }]);
  // Simulate database results while exercising the actual HTTP/controller/service/repository chain.
  mocks.query.mockImplementation(async (sql, params) => {
    expect(sql.trim()).toMatch(/^SELECT /);
    if (sql.includes('FROM innovation_centers')) return { rows: [{ id: params[0], name: 'Centro' }] };
    expect(sql).toContain("b.status='IMPORTED'");
    expect(sql).toContain('r.active AND r.deleted_at IS NULL');
    expect(sql).toContain("EXTRACT(MONTH FROM r.event_at AT TIME ZONE 'UTC')=$4::int");
    const [centerId, year, type, month] = params;
    return { rows: records.filter((record) => record.innovation_center_id === centerId && type === 'EVENTS'
      && new Date(record.event_at).getUTCFullYear() === year
      && (month === null || new Date(record.event_at).getUTCMonth() + 1 === month)) };
  });
});

describe('GET /api/indicator-imports/EVENTS/indicators', () => {
  it.each([[1, 0], [7, 235]])('month=%i retorna %i eventos mantendo o resumo anual', async (month, count) => {
    const result = await request(app).get('/api/indicator-imports/EVENTS/indicators').query({ centerId: 'center-1', year: 2026, month });
    expect(result.status).toBe(200);
    expect(result.body.month).toBe(month);
    expect(result.body.records).toHaveLength(count);
    expect(result.body.monthly).toEqual(monthly);
    expect(result.body.total).toBe(235);
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), ['center-1', 2026, 'EVENTS', null]);
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), ['center-1', 2026, 'EVENTS', month]);
    expect(new Set(result.body.records.map((record) => record.id)).size).toBe(count);
    expect(records).toEqual(snapshot);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('alternar meses e consultar Todos preserva os 235 registros sem duplicar ou escrever', async () => {
    for (const month of [7, 1, 7, undefined]) {
      const result = await request(app).get('/api/indicator-imports/EVENTS/indicators')
        .query({ centerId: 'center-1', year: 2026, ...(month ? { month } : {}) });
      expect(result.status).toBe(200);
      expect(result.body.records).toEqual(month === 1 ? [] : snapshot);
      expect(result.body.monthly).toEqual(monthly);
      expect(result.body.total).toBe(235);
    }
    expect(records).toEqual(snapshot);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each([{ centerId: 'center-2', year: 2026 }, { centerId: 'center-1', year: 2027 }])('mantem centro e ano: %j', async (filters) => {
    const result = await request(app).get('/api/indicator-imports/EVENTS/indicators').query({ ...filters, month: 7 });
    expect(result.status).toBe(200);
    expect(result.body.records).toEqual([]);
    expect(result.body.total).toBe(0);
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), [filters.centerId, filters.year, 'EVENTS', 7]);
  });
  it.each([0, 13])('rejeita month=%i antes de consultar o banco', async (month) => {
    const result = await request(app).get('/api/indicator-imports/EVENTS/indicators').query({ centerId: 'center-1', year: 2026, month });
    expect(result.status).toBe(422);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
