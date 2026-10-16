import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DashboardChart from './DashboardChart.jsx';
import CapacitationChart from './CapacitationChart.jsx';

afterEach(cleanup);

describe('DashboardChart', () => {
  it('renderiza série, resumo acessível e valor negativo', () => {
    render(<DashboardChart title="Resultado mensal" series={[{ code: 'RESULTADO', name: 'Resultado', unit: 'BRL', points: [{ month: 5, value: 6467 }, { month: 6, value: -8494 }] }]} />);
    expect(screen.getByRole('img', { name: /Resultado mensal.*Jun.*-R\$/i })).toBeTruthy();
    expect(screen.getByText('Ver resumo dos dados')).toBeTruthy();
  });

  it.each([false, true])('keeps the metric control inside the card header and selects the same series; initially empty=%s', (empty) => {
    render(<CapacitationChart series={[
      { code: 'CAPACITACOES_REALIZADAS', name: 'Nº de Capacitações Realizadas', unit: 'UNIDADE', points: empty ? [] : [{ month: 1, value: 3 }] },
      { code: 'PESSOAS_CAPACITADAS', name: 'Nº de Pessoas Capacitadas', unit: 'UNIDADE', points: [{ month: 2, value: 42 }] },
    ]} />);
    const control = screen.getByLabelText('Métrica');
    const card = screen.getByRole('heading', { name: 'Capacitações' }).closest('article');
    expect(card.querySelector('header').contains(control)).toBe(true);
    expect(control.value).toBe('CAPACITACOES_REALIZADAS');
    if (empty) expect(screen.getByText('Sem dados para o gráfico.')).toBeTruthy();
    fireEvent.change(control, { target: { value: 'PESSOAS_CAPACITADAS' } });
    expect(control.value).toBe('PESSOAS_CAPACITADAS');
    expect(screen.getByRole('img', { name: /Capacitações.*Pessoas Capacitadas.*Fev 42/ })).toBeTruthy();
    expect(screen.getByText('Ver resumo dos dados')).toBeTruthy();
  });

  it('expõe estado vazio sem quebrar a página', () => {
    render(<DashboardChart title="Sem série" series={[]} />);
    expect(screen.getByText('Sem dados para o gráfico.')).toBeTruthy();
  });
});
