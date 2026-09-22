import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ summary: vi.fn(), recompute: vi.fn(), periods: vi.fn(), dashboard: vi.fn(), record: vi.fn() }));
vi.mock('../src/repositories/indicatorRepository.js', () => mocks);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.record }));
import { exportReport, refresh } from '../src/services/indicatorService.js';
beforeEach(() => { vi.clearAllMocks(); mocks.summary.mockResolvedValue([{ code: 'A&B', name: 'Nome <1>', value: 2, text_value: null, json_value: null, unit: 'UN', period: '2026-01', source: 'MANUAL' }]); });
describe('exportação e atualização de indicadores (RF-008)', () => {
  it('exige período para atualizar e audita atualização válida', async () => {
    await expect(refresh(' ', { sub: 'u1' })).rejects.toMatchObject({ code: 'PERIOD_REQUIRED' });
    await refresh(' 2026-01 ', { sub: 'u1' });
    expect(mocks.recompute).toHaveBeenCalledWith('2026-01'); expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'INDICATORS_REFRESHED' }));
  });
  it('exporta CSV com escape e BOM', async () => {
    const report = await exportReport('csv', { period: '2026-01' }, { sub: 'u1' });
    expect(report).toMatchObject({ contentType: 'text/csv; charset=utf-8', extension: 'csv' });
    expect(report.body).toContain('"A&B"'); expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'INDICATORS_EXPORTED' }));
  });
  it('exporta Excel escapando XML e PDF não vazio', async () => {
    const excel = await exportReport('excel', {}, { sub: 'u1' }); const pdf = await exportReport('pdf', {}, { sub: 'u1', email: 'u@example.com' });
    expect(excel.body).toContain('A&amp;B'); expect(excel.body).toContain('Nome &lt;1&gt;');
    expect(Buffer.isBuffer(pdf.body)).toBe(true); expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });
  it('rejeita formato inválido mesmo com repository acessível', async () => {
    await expect(exportReport('zip', {}, { sub: 'u1' })).rejects.toMatchObject({ code: 'INVALID_EXPORT_FORMAT' });
  });
});
