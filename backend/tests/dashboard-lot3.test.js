import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ institutionalCards: vi.fn(), categories: vi.fn(), latestImport: vi.fn(), series: vi.fn(), record: vi.fn() }));
vi.mock('../src/repositories/dashboardRepository.js', () => ({ ...mocks, operationalSummary: vi.fn(), indicatorReportRows: vi.fn() }));
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.record }));
import { companies, institutionalSummary, normalizeFilters } from '../src/services/dashboardService.js';
beforeEach(() => { vi.clearAllMocks(); mocks.categories.mockResolvedValue(['Financeiro']); mocks.latestImport.mockResolvedValue(null); });
const row = (overrides = {}) => ({ code: 'EMPRESAS_ATIVAS_TOTAL', title: 'Empresas', description: 'Ativas', category: 'Empresas', unit: 'UN', value_type: 'INTEGER', numeric_value: '12', previous_numeric_value: '10', previous_text_value: null, text_value: null, json_value: null, year: 2026, month: 4, source_type: 'FORM_RESPONSE', updated_at: '2026-04-01', ...overrides });
describe('dashboard institucional (RF-008)', () => {
  it('normaliza filtros com centro e rejeita ano inválido', () => {
    expect(normalizeFilters({ year: '2026', centerId: 'c-1' })).toMatchObject({ year: 2026, centerId: 'c-1', month: null });
    expect(() => normalizeFilters({ year: '1999' })).toThrow(/Ano inv/);
  });
  it('consolida cartões, período, última atualização e variação', async () => {
    mocks.institutionalCards.mockResolvedValue([row()]); mocks.latestImport.mockResolvedValue({ imported_at: '2026-04-02', file_name: 'dados.xlsx', sheet_name: 'Base' });
    const result = await institutionalSummary({ year: '2026', month: '4', sourceType: 'SPREADSHEET_IMPORT' });
    expect(result).toMatchObject({ period: '04/2026', lastUpdate: '2026-04-01', source: { type: 'SPREADSHEET_IMPORT', fileName: 'dados.xlsx' } });
    expect(result.cards[0]).toMatchObject({ value: 12, variationAbsolute: 2, variationPercent: 20, direction: 'UP' });
  });
  it('retorna dashboard vazio e origem live sem importação', async () => {
    mocks.institutionalCards.mockResolvedValue([]);
    const result = await institutionalSummary({ year: '2026' });
    expect(result).toMatchObject({ cards: [], lastUpdate: null, source: { type: 'LIVE' } });
  });
  it('agrega série de empresas e aplica filtros ao repository', async () => {
    mocks.institutionalCards.mockResolvedValue([row({ previous_numeric_value: '12' })]);
    mocks.series.mockResolvedValue([row({ name: 'Empresas ativas', period_start: '2026-04-01', period_end: '2026-04-30' })]);
    const result = await companies({ year: '2026', category: 'Empresas', centerId: 'c-1' });
    expect(mocks.series).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ year: 2026, category: 'Empresas', centerId: 'c-1' }));
    expect(result.cards[0].direction).toBe('STABLE'); expect(result.series[0].points[0]).toMatchObject({ value: 12, month: 4 });
  });
  it('não calcula percentual quando o valor anterior é zero ou texto', async () => {
    mocks.institutionalCards.mockResolvedValue([row({ previous_numeric_value: '0' })]); mocks.series.mockResolvedValue([]);
    const result = await companies({ year: '2026' });
    expect(result.cards[0]).toMatchObject({ variationAbsolute: 12, variationPercent: null, direction: 'UP' });
  });
});
