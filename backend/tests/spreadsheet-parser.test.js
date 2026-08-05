import { describe, expect, it } from 'vitest';
import { configuredSpreadsheetPath, validateSource } from '../src/services/spreadsheetImportService.js';
import { parseBrazilianNumber, parseIndicatorWorkbook } from '../src/services/spreadsheetParser.js';
import { REFERENCE_TOTALS_2025 } from '../src/domain/indicatorCatalog.js';

describe('importação da planilha institucional', () => {
  it('converte números, moeda e percentuais brasileiros', () => {
    expect(parseBrazilianNumber('R$ 970.000,00', 'CURRENCY')).toBe(970000);
    expect(parseBrazilianNumber('95%', 'PERCENT')).toBe(.95);
    expect(parseBrazilianNumber('-8.494,00', 'CURRENCY')).toBe(-8494);
    expect(parseBrazilianNumber('')).toBeNull();
  });

  it('lê integralmente CI JOINVILLE e confirma os totais oficiais', async () => {
    const parsed = await parseIndicatorWorkbook(configuredSpreadsheetPath());
    const annual = new Map(parsed.values.filter((item) => item.month === null).map((item) => [item.code, item.numericValue]));
    expect(parsed.sheetName).toBe('CI JOINVILLE');
    expect(parsed.definitions).toHaveLength(42);
    expect(parsed.values).toHaveLength(368);
    for (const [code, expected] of Object.entries(REFERENCE_TOTALS_2025)) expect(annual.get(code)).toBe(expected);
    expect(parsed.values.find((item) => item.code === 'RESULTADO_ANUAL_CENTRO' && item.month === 6)?.numericValue).toBe(-8494);
  });

  it('valida o hash e registra apenas inconsistências não bloqueantes da origem', async () => {
    const validation = await validateSource();
    expect(validation.valid).toBe(true);
    expect(validation.fileHash).toBe('2126B3372D3F341CF8A0FFA3B22749944E087ACEFE5495A1028C7FC0354D84AE');
    expect(validation.warnings.map((item) => item.code)).toEqual(['TEXT_CURRENCY_CELL', 'TEXT_CURRENCY_CELL']);
  });
});
