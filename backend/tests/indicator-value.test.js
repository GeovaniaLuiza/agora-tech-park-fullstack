import { describe, expect, it } from 'vitest';
import { normalizeIndicatorValue } from '../src/services/indicatorValueService.js';

const definition = (valueType, code = 'TESTE') => ({ name: 'Indicador de teste', value_type: valueType, code });

describe('valores de indicadores coletados por formulário', () => {
  it('normaliza inteiro, decimal e moeda como valor numérico', () => {
    expect(normalizeIndicatorValue(definition('INTEGER'), '12').numericValue).toBe(12);
    expect(normalizeIndicatorValue(definition('DECIMAL'), '12,5').numericValue).toBe(12.5);
    expect(normalizeIndicatorValue(definition('CURRENCY'), '1201200.00').numericValue).toBe(1201200);
  });

  it('valida limites percentuais', () => {
    expect(normalizeIndicatorValue(definition('PERCENTAGE'), '95').numericValue).toBe(95);
    expect(() => normalizeIndicatorValue(definition('PERCENTAGE'), '101')).toThrow();
  });

  it('rejeita quantidade negativa e inteiro fracionário', () => {
    expect(() => normalizeIndicatorValue(definition('INTEGER'), '-1')).toThrow();
    expect(() => normalizeIndicatorValue(definition('INTEGER'), '1.5')).toThrow();
  });
});
