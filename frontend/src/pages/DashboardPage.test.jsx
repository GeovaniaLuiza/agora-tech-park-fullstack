import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getOperationalDashboard: vi.fn(), getInstitutionalDashboard: vi.fn(),
  getDashboardCompanies: vi.fn(), getDashboardFinancial: vi.fn(),
  getDashboardProjects: vi.fn(), getDashboardEngagement: vi.fn(),
  downloadDashboardSpreadsheet: vi.fn(),
}));
vi.mock('../services/api.js', () => api);

import DashboardPage from './DashboardPage.jsx';

const points = (values) => values.map((value, index) => ({ month: index + 1, value }));
const series = (code, name, values, unit = 'UNIDADE') => ({ code, name, unit, valueType: unit === 'BRL' ? 'CURRENCY' : 'NUMBER', points: points(values) });

beforeEach(() => {
  api.getOperationalDashboard.mockResolvedValue({ active_organizations: 4, active_forms: 2, response_rate: 50, monitored_indicators: 42 });
  api.getInstitutionalDashboard.mockResolvedValue({ lastUpdate: '2026-08-04T12:00:00Z', categories: ['Financeiro'], source: { fileName: 'Indicadores Rede de Centros de Inovação 2025_Joinville.xlsx' }, cards: [{ code: 'RECEITA_TOTAL_CENTRO', title: 'Receita Total do Centro', description: 'Receita anual', value: 1829191, valueType: 'CURRENCY', unit: 'BRL', period: '2025', updatedAt: '2026-08-04T12:00:00Z', variationPercent: null }] });
  api.getDashboardCompanies.mockResolvedValue({ series: [series('EMPRESAS_ATIVAS_TOTAL', 'Empresas ativas', [39, 41]), series('NOVAS_EMPRESAS_ATIVAS', 'Novas empresas', [1, 2])] });
  api.getDashboardFinancial.mockResolvedValue({ series: [series('RESULTADO_ANUAL_CENTRO', 'Resultado', [37459, 66647, 28892, 56604, 6467, -8494], 'BRL')] });
  api.getDashboardProjects.mockResolvedValue({ series: [series('PROJETOS_SUBMETIDOS', 'Projetos submetidos', [1]), series('PROJETOS_GANHOS', 'Projetos ganhos', [0])] });
  api.getDashboardEngagement.mockResolvedValue({ series: [series('VISITANTES_CENTRO', 'Visitantes', [116]), series('CAPACITACOES_REALIZADAS', 'Capacitações', [3])] });
  api.downloadDashboardSpreadsheet.mockResolvedValue({ blob: new Blob(['x']), filename: 'indicadores-joinville-2025.xlsx' });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('DashboardPage', () => {
  it('combina resumo operacional, KPIs oficiais e séries mensais', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Residentes ativos')).toBeTruthy();
    expect(await screen.findByText(/R\$\s1\.829\.191,00/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /Receita, despesas e resultado.*Jun.*-R\$/i })).toBeTruthy();
    expect(screen.getByText('Indicadores institucionais — 2025')).toBeTruthy();
  });

  it('recarrega as seções institucionais ao alterar categoria', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByText(/R\$\s1\.829\.191,00/);
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Financeiro' } });
    await waitFor(() => expect(api.getInstitutionalDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'Financeiro', year: '2025' })));
    expect(api.getOperationalDashboard).toHaveBeenCalledOnce();
  });

  it('isola falha de uma seção e oferece nova tentativa', async () => {
    api.getInstitutionalDashboard.mockRejectedValueOnce(new Error('Falha institucional'));
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Falha institucional')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
    expect(await screen.findByText('Residentes ativos')).toBeTruthy();
  });
});
