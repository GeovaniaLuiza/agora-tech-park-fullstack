import { describe, expect, it } from 'vitest';
import { normalizeFilters } from '../src/services/dashboardService.js';

describe('filtros do dashboard institucional', () => {
  it('normaliza ano, mês, categoria, intervalo e origem', () => {
    expect(normalizeFilters({ year: '2025', month: '6', category: 'Financeiro', startDate: '2025-06-01', endDate: '2025-06-30' })).toEqual({
      year: 2025, month: 6, category: 'Financeiro', sourceType: 'LIVE', centerId: null, startDate: '2025-06-01', endDate: '2025-06-30',
    });
  });

  it('rejeita período e origem inválidos', () => {
    expect(() => normalizeFilters({ month: '13' })).toThrow(/Mês inválido/);
    expect(() => normalizeFilters({ sourceType: 'DEMO' })).toThrow(/Origem inválida/);
  });
});
