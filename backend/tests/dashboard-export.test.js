import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  indicatorReportRows: vi.fn(),
  record: vi.fn(),
}));

vi.mock('../src/repositories/dashboardRepository.js', () => ({
  operationalSummary: vi.fn(),
  indicatorReportRows: mocks.indicatorReportRows,
}));
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.record }));

import { exportIndicatorSpreadsheet } from '../src/services/dashboardService.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.record.mockResolvedValue();
  mocks.indicatorReportRows.mockResolvedValue([{
    center_name: 'Centro Joinville',
    code: 'RECEITA_TOTAL_CENTRO',
    name: 'Receita Total do Centro',
    description: 'Receita consolidada',
    category: 'Saúde financeira',
    unit: 'BRL',
    value_type: 'CURRENCY',
    numeric_value: '1829191.25',
    text_value: null,
    json_value: null,
    year: 2026,
    month: 8,
    source_type: 'FORM_RESPONSE',
    period_start: '2026-08-01',
    period_end: '2026-08-31',
  }]);
});

describe('exportação do relatório de indicadores', () => {
  it('gera XLSX com os dados consolidados e os filtros selecionados', async () => {
    const report = await exportIndicatorSpreadsheet(
      { year: '2026', month: '8', category: 'Saúde financeira', sourceType: 'LIVE', centerId: 'center-1' },
      { sub: 'user-1' },
    );

    expect(mocks.indicatorReportRows).toHaveBeenCalledWith(expect.objectContaining({
      year: 2026, month: 8, category: 'Saúde financeira', sourceType: 'LIVE', centerId: 'center-1',
    }));
    expect(report.fileName).toBe('relatorio-indicadores-2026-08.xlsx');
    expect(report.rows).toBe(1);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(report.body);
    const sheet = workbook.getWorksheet('Indicadores');
    expect(sheet.getRow(4).values).toContain('Indicador');
    expect(sheet.getRow(5).getCell(2).value).toBe('RECEITA_TOTAL_CENTRO');
    expect(sheet.getRow(5).getCell(9).value).toBe(1829191.25);
    expect(sheet.getRow(5).getCell(12).value).toBe('Formulário');
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', action: 'INDICATORS_EXPORTED', details: expect.objectContaining({ rows: 1 }),
    }));
  });
});
