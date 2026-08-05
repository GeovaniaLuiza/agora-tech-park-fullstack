import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DashboardChart from './DashboardChart.jsx';

afterEach(cleanup);

describe('DashboardChart', () => {
  it('renderiza série, resumo acessível e valor negativo', () => {
    render(<DashboardChart title="Resultado mensal" series={[{ code: 'RESULTADO', name: 'Resultado', unit: 'BRL', points: [{ month: 5, value: 6467 }, { month: 6, value: -8494 }] }]} />);
    expect(screen.getByRole('img', { name: /Resultado mensal.*Jun.*-R\$/i })).toBeTruthy();
    expect(screen.getByText('Ver resumo dos dados')).toBeTruthy();
  });

  it('expõe estado vazio sem quebrar a página', () => {
    render(<DashboardChart title="Sem série" series={[]} />);
    expect(screen.getByText('Sem dados para o gráfico.')).toBeTruthy();
  });
});
