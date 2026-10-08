import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ getInnovationCenters: vi.fn(), getConfirmedImportIndicators: vi.fn(), getOfficialWorkbookStatus: vi.fn(), downloadOfficialIndicatorWorkbook: vi.fn() }));
vi.mock('../services/api.js', () => api);
import ImportedIndicatorsPage from './ImportedIndicatorsPage.jsx';
const events = { monthly: [1, 0, 2, ...Array(9).fill(0)], total: 3, records: [
  { id: 'e1', name: 'Evento confirmado', event_at: '2026-03-15', location: 'Auditório', theme: 'Tecnologia', mode: 'PRESENTIAL', participants: 25, participating_companies: 4, subtype: 'Workshop' },
] };
beforeEach(() => { vi.resetAllMocks(); api.getInnovationCenters.mockResolvedValue([{ id: 'c1', name: 'Centro A' }]); api.getConfirmedImportIndicators.mockResolvedValue(events); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('telas específicas de indicadores confirmados', () => {
  it.each(['EVENTS', 'RESIDENTS'])('permite baixar XLSX após consultar %s com a estratégia existente', async (type) => {
    api.getOfficialWorkbookStatus.mockResolvedValue({ requiresStrategy: true });
    api.downloadOfficialIndicatorWorkbook.mockResolvedValue({ blob: new Blob(['xlsx']), filename: 'indicadores.xlsx' });
    const create = vi.fn(() => 'blob:official');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<MemoryRouter initialEntries={['/?centerId=c1&year=2026']}><ImportedIndicatorsPage type={type} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar XLSX' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Substituir os blocos autorizados' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar arquivo' }));
    await waitFor(() => expect(api.downloadOfficialIndicatorWorkbook).toHaveBeenCalledWith({ centerId: 'c1', year: 2026, strategy: 'REPLACE' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:official'));
  });
  it('mostra meses, total, detalhamento, participantes e empresas', async () => {
    render(<MemoryRouter initialEntries={['/?centerId=c1&year=2026']}><ImportedIndicatorsPage type="EVENTS" /></MemoryRouter>);
    await screen.findByText('Evento confirmado');
    const table = screen.getByRole('table', { name: 'Indicador mensal' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez', 'Total']);
    expect(within(table).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['1', '0', '2', ...Array(9).fill('0'), '3']);
    const row = screen.getByText('Evento confirmado').closest('tr');
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Evento confirmado', '15/03/2026', 'Auditório', 'Tecnologia', 'Presencial', '25', 'Workshop', '4']);
  });
  it('consulta o endpoint novamente para ano e mês selecionados', async () => {
    render(<MemoryRouter initialEntries={['/?centerId=c1&year=2026']}><ImportedIndicatorsPage type="EVENTS" /></MemoryRouter>);
    await screen.findByText('Evento confirmado');
    fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2027' } });
    await waitFor(() => expect(api.getConfirmedImportIndicators).toHaveBeenLastCalledWith('EVENTS', { centerId: 'c1', year: '2027' }));
    fireEvent.change(screen.getByLabelText('Mês'), { target: { value: '3' } });
    await waitFor(() => expect(api.getConfirmedImportIndicators).toHaveBeenLastCalledWith('EVENTS', { centerId: 'c1', year: '2027', month: '3' }));
  });
  it('mostra todas as ocupações e apenas os campos disponíveis em Clientes.xlsx', async () => {
    api.getConfirmedImportIndicators.mockResolvedValue({ monthly: Array(12).fill(1), total: 1, annualAggregation: 'LAST_VALUE', records: [{ id: 'r1', name: 'Empresa única', extra: { documentFormatted: '11.222.333/0001-81', contracts: [
      { block: 'HUB', unit: 'HUB 201', area: 50, startDate: '2026-01-01', sector: 'Tecnologia', nationality: 'Brasileira' },
      { block: 'UNI', unit: 'UNI 301', area: 30, startDate: '2026-03-15', endDate: '2026-09-12' },
    ] } }] });
    render(<MemoryRouter initialEntries={['/?centerId=c1&year=2026']}><ImportedIndicatorsPage type="RESIDENTS" /></MemoryRouter>);
    await screen.findByText('HUB 201');
    expect(screen.getAllByText('Empresa única')).toHaveLength(2);
    const table = screen.getByRole('table', { name: 'Registros confirmados' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Empresa', 'CNPJ', 'Vigência', 'Fim', 'Bloco', 'Bloco e Módulo', 'Área', 'Atividades', 'Nacionalidade']);
    expect(screen.getByText('UNI 301')).toBeTruthy();
    expect(screen.getAllByText('Não informado').length).toBeGreaterThan(0);
    expect(screen.getByText(/posição de dezembro/)).toBeTruthy();
  });
  it('exibe erros do endpoint', async () => {
    api.getConfirmedImportIndicators.mockRejectedValue(new Error('Falha ao consultar registros'));
    render(<MemoryRouter initialEntries={['/?centerId=c1&year=2026']}><ImportedIndicatorsPage type="RESIDENTS" /></MemoryRouter>);
    expect((await screen.findByRole('alert')).textContent).toBe('Falha ao consultar registros');
  });
});
