import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, formatIndicatorValue, formatNumber, formatPercent } from './formatters.js';

describe('formatadores institucionais', () => {
  it('aplica a convenção brasileira', () => {
    expect(formatNumber(1054)).toBe('1.054');
    expect(formatCurrency(970000)).toMatch(/R\$\s970\.000,00/);
    expect(formatPercent(.95)).toBe('95%');
    expect(formatDate('2025-12-31T12:00:00Z')).toBe('31/12/2025');
  });

  it('formata por tipo e preserva ausência de valor', () => {
    expect(formatIndicatorValue(435080, 'CURRENCY', 'BRL')).toMatch(/R\$\s435\.080,00/);
    expect(formatIndicatorValue(.95, 'PERCENT', 'PERCENT')).toBe('95%');
    expect(formatIndicatorValue(null, 'NUMBER', 'UNIDADE')).toBe('—');
  });
});
