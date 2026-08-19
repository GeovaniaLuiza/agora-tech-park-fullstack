import { describe, expect, it } from 'vitest';
import { configuredSpreadsheetPath, validateSource } from '../src/services/spreadsheetImportService.js';
import { parseBrazilianNumber, parseIndicatorWorkbook } from '../src/services/spreadsheetParser.js';

describe('importação da planilha institucional', () => {
  it('converte números, moeda e percentuais brasileiros', () => {
    expect(parseBrazilianNumber('R$ 970.000,00', 'CURRENCY')).toBe(970000);
    expect(parseBrazilianNumber('95%', 'PERCENT')).toBe(.95);
    expect(parseBrazilianNumber('-8.494,00', 'CURRENCY')).toBe(-8494);
    expect(parseBrazilianNumber('')).toBeNull();
  });

  it('lê integralmente CI JOINVILLE para 2026', async () => {
    const parsed = await parseIndicatorWorkbook(configuredSpreadsheetPath(), { year: 2026 });
    const annual = new Map(parsed.values.filter((item) => item.month === null).map((item) => [item.code, item.numericValue]));
    expect(parsed.sheetName).toBe('CI JOINVILLE');
    expect(parsed.year).toBe(2026);
    expect(parsed.definitions).toHaveLength(42);
    expect(parsed.values).toHaveLength(29);
    expect(annual.has('NOVAS_EMPRESAS_ATIVAS')).toBe(false);
    expect(annual.has('RESULTADO_ANUAL_CENTRO')).toBe(false);
  });

  it('valida o hash da planilha de 2026 sem avisos bloqueantes', async () => {
    const validation = await validateSource();
    expect(validation.valid).toBe(true);
    expect(validation.fileHash).toBe('A61DCE769CE04148A601A051D28945BF40E49C31636BA1BD9A28102D251F6C3A');
    expect(validation.warnings).toEqual([]);
  });
});
