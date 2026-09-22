import { describe, expect, it } from 'vitest';
import { normalizeIndicatorValue } from '../src/services/indicatorValueService.js';

const definition = (valueType, code = 'TESTE') => ({ name: 'Indicador de teste', value_type: valueType, code });

describe('regras adicionais de valores de indicadores', () => {
  it('preserva indicador textual', () => {
    expect(normalizeIndicatorValue(definition('TEXT'), ' relatorio final ')).toMatchObject({ textValue: 'relatorio final', numericValue: null });
  });

  it('rejeita valor ausente ou nao numerico', () => {
    expect(() => normalizeIndicatorValue(definition('TEXT'), '   ')).toThrow(/Informe/);
    expect(() => normalizeIndicatorValue(definition('DECIMAL'), 'doze')).toThrow(/Valor/);
  });

  it('rejeita percentual negativo', () => {
    expect(() => normalizeIndicatorValue(definition('PERCENT'), '-0.1')).toThrow(/entre 0 e 100/);
  });

  it('permite resultado anual calculado negativo', () => {
    expect(normalizeIndicatorValue(definition('DECIMAL', 'RESULTADO_ANUAL_CENTRO'), '-25').numericValue).toBe(-25);
  });
});
