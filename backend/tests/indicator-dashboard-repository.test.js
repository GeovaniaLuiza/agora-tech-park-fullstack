import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/db/pool.js', () => ({ query: vi.fn() }));
import { summary } from '../src/repositories/indicatorRepository.js';

describe('consulta do dashboard oficial de indicadores', () => {
  it.each([
    [true, true], [false, false], ['true', true], ['false', false],
    [undefined, false], [null, false], ['', false], [1, false], ['1', false],
  ])('normaliza officialDashboard=%s sem coerção frouxa', async (officialDashboard, expected) => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await summary({ sourceType: 'SPREADSHEET_IMPORT', officialDashboard, codes: 'TEST' }, client);
    expect(client.query.mock.calls[0][1].slice(6)).toEqual([expected, expected ? ['TEST'] : null]);
  });

  it('isola centro, ano e origem e inclui definições sem valores', async () => {
    const rows = [{ code: 'EVENTOS_REALIZADOS', value: null, monthly_values: [] }];
    const client = { query: vi.fn().mockResolvedValue({ rows }) };
    expect(await summary({ centerId: 'center-a', year: '2026', sourceType: 'SPREADSHEET_IMPORT', officialDashboard: 'true' }, client)).toEqual(rows);
    const [sql, parameters] = client.query.mock.calls[0];
    expect(parameters).toEqual([2026, null, null, null, 'SPREADSHEET_IMPORT', 'center-a', true, null]);
    expect(sql).toContain('v.deleted_at IS NULL');
    expect(sql).toContain('LEFT JOIN effective');
    expect(sql).toContain('$7::boolean OR');
    expect(sql).toContain('annual.month IS NULL');
    expect(sql).toContain('monthly.month IS NOT NULL');
    expect(sql).toContain("$7::boolean AND v.source_type='SYSTEM_CALCULATION'");
    expect(sql).toContain("code IN ('EMPRESAS_RESIDENTES','EVENTOS_REALIZADOS')");
    expect(sql).toContain("BOOL_AND(v.source_type='SPREADSHEET_IMPORT')");
  });

  it('exporta a seleção por códigos parametrizados e mantém o mês solicitado', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await summary({ centerId: 'center-b', period: '2025-03', category: 'Financeiro', sourceType: 'SPREADSHEET_IMPORT', officialDashboard: true, codes: 'RECEITA_TOTAL_CENTRO,DESPESAS_TOTAL_CENTRO' }, client);
    expect(client.query.mock.calls[0][1]).toEqual([2025, 3, null, 'Financeiro', 'SPREADSHEET_IMPORT', 'center-b', true, ['RECEITA_TOTAL_CENTRO', 'DESPESAS_TOTAL_CENTRO']]);
    expect(client.query.mock.calls[0][0]).toContain('d.code=ANY($8::text[])');
  });

  it('preserva o comportamento anterior em consultas LIVE e outras telas', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await summary({ year: 2026, officialDashboard: true, codes: 'TEST' }, client);
    expect(client.query.mock.calls[0][1].slice(4)).toEqual(['LIVE', null, false, null]);
    await summary({ year: 2026, sourceType: 'SPREADSHEET_IMPORT' }, client);
    expect(client.query.mock.calls[1][1].slice(4)).toEqual(['SPREADSHEET_IMPORT', null, false, null]);
  });
});
