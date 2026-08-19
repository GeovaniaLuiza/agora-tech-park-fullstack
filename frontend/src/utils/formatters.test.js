import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatIndicatorCode,
  formatIndicatorSource,
  formatIndicatorValue,
  formatNumber,
  formatPercent,
  parseIndicatorLabel,
} from './formatters.js';

describe('formatadores institucionais', () => {
  it('aplica a convenção brasileira', () => {
    expect(formatNumber(1054)).toBe('1.054');
    expect(formatCurrency(970000)).toMatch(/R\$\s970\.000,00/);
    expect(formatPercent(0.95)).toBe('95%');
    expect(formatDate('2025-12-31T12:00:00Z')).toBe('31/12/2025');
  });

  it('formata por tipo e preserva ausência de valor', () => {
    expect(formatIndicatorValue(435080, 'CURRENCY', 'BRL')).toMatch(/R\$\s435\.080,00/);
    expect(formatIndicatorValue(0.95, 'PERCENT', 'PERCENT')).toBe('95%');
    expect(formatIndicatorValue(null, 'NUMBER', 'UNIDADE')).toBe('—');
  });

  it('separa somente rótulos legados e formata metadados técnicos', () => {
    expect(parseIndicatorLabel('CapacitaçõesCAPACITACOES_REALIZADAS')).toEqual({
      category: 'Capacitações',
      code: 'CAPACITACOES_REALIZADAS',
    });
    expect(parseIndicatorLabel('CapacitaçõesEMPRESAS_CAPACITADAS')).toEqual({
      category: 'Capacitações',
      code: 'EMPRESAS_CAPACITADAS',
    });
    expect(parseIndicatorLabel('Indicadores Econômicos')).toEqual({
      category: 'Indicadores Econômicos',
      code: '',
    });
    expect(formatIndicatorCode('VALOR_PROJETOS_CAPACITACAO')).toBe('Valor Projetos Capacitacao');
    expect(formatIndicatorSource('SPREADSHEET_IMPORT', '2025')).toBe('Spreadsheet Import · 2025');
    expect(formatIndicatorSource('2026MANUAL_ENTRY')).toBe('Manual Entry · 2026');
  });
});
