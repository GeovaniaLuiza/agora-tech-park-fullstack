import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseResidentWorkbook } from '../src/services/residentImportParser.js';
import { residentWorkbookFixture } from './fixtures/indicator-import-workbooks.js';

const mocks = vi.hoisted(() => ({ findCenter: vi.fn(), confirmedRecords: vi.fn(), listDefinitions: vi.fn() }));
vi.mock('../src/repositories/indicatorImportRepository.js', () => ({ findCenter: mocks.findCenter, confirmedRecords: mocks.confirmedRecords }));
vi.mock('../src/repositories/indicatorManagementRepository.js', () => ({ listDefinitions: mocks.listDefinitions }));
import { confirmedIndicators } from '../src/services/importedIndicatorService.js';
const user = { role: 'ADMIN' };
const filters = { type: 'EVENTS', centerId: 'center-1', year: '2026' };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findCenter.mockResolvedValue({ id: 'center-1', name: 'Centro' });
  mocks.listDefinitions.mockResolvedValue([
    { id: 'events', code: 'EVENTOS_REALIZADOS', value_type: 'INTEGER', calculation_type: 'AUTOMATIC', annual_aggregation: 'SUM' },
    { id: 'residents', code: 'EMPRESAS_RESIDENTES', value_type: 'INTEGER', calculation_type: 'AUTOMATIC', annual_aggregation: 'LAST_VALUE' },
  ]);
});
describe('indicadores de registros confirmados', () => {
  it('conta eventos em meses diferentes, total anual e preserva participantes e empresas', async () => {
    const records = [
      { id: 'a', active: true, record_type: 'EVENT', name: 'Janeiro', event_at: '2026-01-31T23:30:00Z', participants: 20, participating_companies: 3 },
      { id: 'b', active: true, record_type: 'EVENT', name: 'Março', event_at: '2026-03-10T00:00:00Z', participants: 50, participating_companies: 7 },
      { id: 'c', active: true, record_type: 'EVENT', name: 'Março 2', event_at: '2026-03-11T00:00:00Z', participants: 0, participating_companies: 0 },
    ];
    mocks.confirmedRecords.mockResolvedValue(records);
    const result = await confirmedIndicators(filters, user);
    expect(result.monthly).toEqual([1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result.total).toBe(3);
    expect(result.records).toEqual(records);
    const march = await confirmedIndicators({ ...filters, month: '3' }, user);
    expect(march.records).toEqual(records.slice(1));
    expect(march.total).toBe(3);
    expect(march.records[0]).toMatchObject({ participants: 50, participating_companies: 7 });
  });
  it('encaminha centro e ano ao repositório e filtra o ano no cálculo', async () => {
    mocks.confirmedRecords.mockResolvedValue([{ active: true, record_type: 'EVENT', event_at: '2027-05-01' }]);
    const result = await confirmedIndicators({ ...filters, year: '2027' }, user);
    expect(mocks.confirmedRecords).toHaveBeenCalledWith('center-1', 2027, 'EVENTS');
    expect(result.monthly[4]).toBe(1);
    expect(result.total).toBe(1);
  });
  it('consolida CNPJ, preserva ocupações HUB/UNI/MOB e ignora Disponível e Áreas Comuns', async () => {
    const parsed = await parseResidentWorkbook(await residentWorkbookFixture());
    const a = parsed.items.find((item) => item.name === 'Empresa Anônima A');
    expect(a.sourceRows).toEqual([3, 4]);
    expect(a.contracts.map((contract) => contract.block)).toEqual(['HUB', 'UNI']);
    expect(parsed.items.filter((item) => item.ignored)).toHaveLength(2);
    const considered = parsed.items.filter((item) => ['Empresa Anônima A', 'Empresa B'].includes(item.name));
    const records = considered.map((item) => ({ id: item.id, active: true, record_type: 'RESIDENT_COMPANY', name: item.name,
      start_date: item.startDate, end_date: item.endDate, extra: { documentHash: item.documentHash, document: item.document, contracts: item.contracts } }));
    // Mesmo CNPJ em outro registro não pode duplicar o estoque mensal.
    records.push({ ...records[0], id: 'another-occupation', extra: { ...records[0].extra, document: '11.222.333/0001-81', documentHash: 'legacy-hash' } });
    mocks.confirmedRecords.mockResolvedValue(records);
    const result = await confirmedIndicators({ ...filters, type: 'RESIDENTS' }, user);
    expect(result.monthly).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1]);
    expect(result.total).toBe(1);
    expect(result.records[0].extra.contracts).toHaveLength(2);
    const october = await confirmedIndicators({ ...filters, type: 'RESIDENTS', month: '10' }, user);
    expect(october.records.map((record) => record.name)).not.toContain('Empresa B');
  });
  it('conta entrada e saída intermediárias e preserva lacunas entre ocupações', async () => {
    mocks.confirmedRecords.mockResolvedValue([{ id: 'a', active: true, record_type: 'RESIDENT_COMPANY', extra: { document: '11222333000181', contracts: [
      { eligibleBlock: true, block: 'HUB', startDate: '2026-03-15', endDate: '2026-05-12' },
      { eligibleBlock: true, block: 'UNI', startDate: '2026-07-20', endDate: '2026-08-01' },
      { eligibleBlock: false, block: 'Z', startDate: '2026-01-01', endDate: null },
    ] } }]);
    const result = await confirmedIndicators({ ...filters, type: 'RESIDENTS' }, user);
    expect(result.monthly).toEqual([0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0]);
    expect(result.total).toBe(0);
  });
  it.each([{ year: 'x' }, { month: '0' }, { month: '13' }, { centerId: '' }])('mostra erro de filtro inválido: %j', async (override) => {
    await expect(confirmedIndicators({ ...filters, ...override }, user)).rejects.toMatchObject({ status: 422 });
    expect(mocks.confirmedRecords).not.toHaveBeenCalled();
  });
});
