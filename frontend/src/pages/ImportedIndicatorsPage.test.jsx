import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ getInnovationCenters: vi.fn(), getConfirmedImportIndicators: vi.fn(), getOfficialWorkbookStatus: vi.fn(), downloadOfficialIndicatorWorkbook: vi.fn() }));
vi.mock('../services/api.js', () => api);
import ImportedIndicatorsPage from './ImportedIndicatorsPage.jsx';
const events = { monthly: [1, 0, 2, ...Array(9).fill(0)], total: 3, records: [
  { id: 'e1', name: 'Evento confirmado', event_at: '2026-03-15', location: 'Auditório', theme: 'Tecnologia', mode: 'PRESENTIAL', participants: 25, participating_companies: 4, subtype: 'Workshop' },
] };
function QueryLocation() {
  const location = useLocation();
  return <output data-testid="query-location">{location.search}</output>;
}
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
    render(<MemoryRouter initialEntries={['/?centerId=c1&year=2026&month=1']}><ImportedIndicatorsPage type={type} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar XLSX' }));
    expect(api.getOfficialWorkbookStatus).toHaveBeenCalledWith('c1', '2026');
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
  it('preserva a query e atualiza Jan/Jul/Todos mantendo o total anual e os registros unicos', async () => {
    const records = Array.from({ length: 235 }, (_, index) => ({ id: `july-${index}`, name: `Evento julho ${index}`, event_at: '2026-07-01' }));
    const snapshot = structuredClone(records);
    const monthly = [0, 0, 0, 0, 0, 0, 235, 0, 0, 0, 0, 0];
    api.getConfirmedImportIndicators.mockImplementation(async (_type, filters) => ({ monthly, total: 235, records: filters.month === '1' ? [] : records }));
    render(<MemoryRouter initialEntries={['/indicadores/eventos?centerId=c1&year=2026&month=1&extra=preserved']}><ImportedIndicatorsPage type="EVENTS" /><QueryLocation /></MemoryRouter>);
    await screen.findByText('Nenhum registro confirmado para o período.');
    expect(api.getConfirmedImportIndicators).toHaveBeenLastCalledWith('EVENTS', { centerId: 'c1', year: '2026', month: '1' });
    const assertSummary = () => expect(within(screen.getByRole('table', { name: 'Indicador mensal' })).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([...monthly, 235].map(String));
    assertSummary();
    for (const month of ['7', '1', '7', '']) {
      fireEvent.change(screen.getByLabelText('Mês'), { target: { value: month } });
      await waitFor(() => expect(api.getConfirmedImportIndicators).toHaveBeenLastCalledWith('EVENTS', { centerId: 'c1', year: '2026', ...(month ? { month } : {}) }));
      if (month === '1') await screen.findByText('Nenhum registro confirmado para o período.');
      else await screen.findByText('Evento julho 234');
      const params = new URLSearchParams(screen.getByTestId('query-location').textContent);
      expect(params.get('month')).toBe(month || null);
      expect(params.get('centerId')).toBe('c1');
      expect(params.get('year')).toBe('2026');
      expect(params.get('extra')).toBe('preserved');
      const detailRows = within(screen.getByRole('table', { name: 'Registros confirmados' })).getAllByRole('row').slice(1);
      expect(detailRows).toHaveLength(month === '1' ? 0 : 235);
      expect(new Set(detailRows.map((row) => row.textContent)).size).toBe(detailRows.length);
      assertSummary();
    }
    expect(records).toEqual(snapshot);
  });
  it('mantem month na query e na consulta ao trocar centro e ano', async () => {
    api.getInnovationCenters.mockResolvedValue([{ id: 'c1', name: 'Centro A' }, { id: 'c2', name: 'Centro B' }]);
    render(<MemoryRouter initialEntries={['/?centerId=c1&year=2026&month=7']}><ImportedIndicatorsPage type="EVENTS" /><QueryLocation /></MemoryRouter>);
    await screen.findByText('Evento confirmado');
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'c2' } });
    await waitFor(() => expect(api.getConfirmedImportIndicators).toHaveBeenLastCalledWith('EVENTS', { centerId: 'c2', year: '2026', month: '7' }));
    fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2027' } });
    await waitFor(() => expect(api.getConfirmedImportIndicators).toHaveBeenLastCalledWith('EVENTS', { centerId: 'c2', year: '2027', month: '7' }));
    expect(screen.getByTestId('query-location').textContent).toBe('?centerId=c2&year=2027&month=7');
  });
  it('descarta a resposta anterior quando o mes muda durante a consulta', async () => {
    let resolveJanuary;
    api.getConfirmedImportIndicators.mockImplementation((_type, filters) => filters.month === '1'
      ? new Promise((resolve) => { resolveJanuary = resolve; }) : Promise.resolve(events));
    render(<MemoryRouter initialEntries={['/?centerId=c1&year=2026&month=1']}><ImportedIndicatorsPage type="EVENTS" /></MemoryRouter>);
    await waitFor(() => expect(resolveJanuary).toBeTypeOf('function'));
    fireEvent.change(screen.getByLabelText('Mês'), { target: { value: '7' } });
    await screen.findByText('Evento confirmado');
    resolveJanuary({ ...events, records: [] });
    await waitFor(() => expect(screen.getByText('Evento confirmado')).toBeTruthy());
    expect(screen.queryByText('Nenhum registro confirmado para o período.')).toBeNull();
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
