import { describe, expect, it } from 'vitest';
import { calculateIndicatorRows } from '../src/services/indicatorCalculationService.js';

const definition = (code, calculationType = 'AUTOMATIC', annualAggregation = 'SUM', valueType = 'INTEGER') => ({
  id: `id-${code}`, code, calculation_type: calculationType, annual_aggregation: annualAggregation, value_type: valueType,
});
const calculate = (definitions, records = [], manualValues = []) => calculateIndicatorRows({
  definitions, records, manualValues, year: 2026, center: {}, applicability: new Map(),
});
const value = (rows, code, month) => rows.find((row) => row.indicatorId === `id-${code}` && row.month === month)?.numericValue;

describe('serviço central de cálculo de indicadores', () => {
  it('recalcula evento ao mover de agosto para setembro e ao excluir', () => {
    const definitions = [definition('EVENTOS_REALIZADOS')];
    const august = calculate(definitions, [{ record_type: 'EVENT', name: 'Demo Day', event_at: '2026-08-14T12:00:00Z', active: true }]);
    expect(value(august, 'EVENTOS_REALIZADOS', 8)).toBe(1);
    expect(value(august, 'EVENTOS_REALIZADOS', null)).toBe(1);

    const september = calculate(definitions, [{ record_type: 'EVENT', name: 'Demo Day', event_at: '2026-09-14T12:00:00Z', active: true }]);
    expect(value(september, 'EVENTOS_REALIZADOS', 8)).toBe(0);
    expect(value(september, 'EVENTOS_REALIZADOS', 9)).toBe(1);
    expect(value(september, 'EVENTOS_REALIZADOS', null)).toBe(1);

    const removed = calculate(definitions);
    expect(value(removed, 'EVENTOS_REALIZADOS', 9)).toBe(0);
    expect(value(removed, 'EVENTOS_REALIZADOS', null)).toBe(0);
  });

  it('deriva resultado mensal sem permitir valor independente', () => {
    const definitions = [
      definition('RECEITA_TOTAL_CENTRO', 'MANUAL', 'SUM', 'CURRENCY'),
      definition('DESPESAS_TOTAL_CENTRO', 'MANUAL', 'SUM', 'CURRENCY'),
      definition('RESULTADO_ANUAL_CENTRO', 'DERIVED', 'DERIVED', 'CURRENCY'),
    ];
    const manual = (cost) => [
      { code: 'RECEITA_TOTAL_CENTRO', month: 8, numeric_value: '150000' },
      { code: 'DESPESAS_TOTAL_CENTRO', month: 8, numeric_value: String(cost) },
    ];
    expect(value(calculate(definitions, [], manual(120000)), 'RESULTADO_ANUAL_CENTRO', 8)).toBe(30000);
    expect(value(calculate(definitions, [], manual(130000)), 'RESULTADO_ANUAL_CENTRO', 8)).toBe(20000);
  });

  it('calcula estoques de mantenedores e empresas incubadas na competência', () => {
    const definitions = [definition('MANTENEDORES', 'AUTOMATIC', 'LAST_VALUE'), definition('EMPRESAS_INCUBADAS', 'AUTOMATIC', 'LAST_VALUE')];
    const rows = calculate(definitions, [
      { record_type: 'MAINTAINER', name: 'Mantenedor', start_date: '2026-01-01', active: true },
      { record_type: 'DEVELOPMENT_COMPANY', name: 'Startup', start_date: '2026-08-10', development_stage: 'INCUBATION', active: true },
    ]);
    expect(value(rows, 'MANTENEDORES', 8)).toBe(1);
    expect(value(rows, 'EMPRESAS_INCUBADAS', 7)).toBe(0);
    expect(value(rows, 'EMPRESAS_INCUBADAS', 8)).toBe(1);
    const inactive = calculate(definitions, [{ record_type: 'MAINTAINER', name: 'Mantenedor', start_date: '2026-01-01', active: false }]);
    expect(value(inactive, 'MANTENEDORES', 8)).toBe(0);
  });

  it('calcula empresas residentes ativas em cada mês importado', () => {
    const definitions = [definition('EMPRESAS_RESIDENTES', 'AUTOMATIC', 'SUM')];
    const rows = calculate(definitions, [
      { record_type: 'RESIDENT_COMPANY', name: 'Residente A', start_date: '2026-01-15', end_date: '2026-03-10', active: true },
      { record_type: 'RESIDENT_COMPANY', name: 'Residente B', start_date: '2026-02-01', end_date: null, active: true },
    ]);
    expect(value(rows, 'EMPRESAS_RESIDENTES', 1)).toBe(1);
    expect(value(rows, 'EMPRESAS_RESIDENTES', 2)).toBe(2);
    expect(value(rows, 'EMPRESAS_RESIDENTES', 4)).toBe(1);
  });
});
