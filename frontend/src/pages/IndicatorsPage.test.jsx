import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getIndicators: vi.fn(), getIndicatorHistory: vi.fn(), getInnovationCenters: vi.fn(), downloadIndicatorReport: vi.fn() }));
vi.mock('../services/api', () => api);
vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: () => ({ user: { role: 'ADMIN' } }) }));
import IndicatorsPage from './IndicatorsPage.jsx';
import { indicatorBlocks } from '../config/officialIndicators.js';

// Test fixtures exercise rendering and filters; no fixture is shipped to the UI.
const rows = [
  { code: 'NOVAS_STARTUPS', name: 'Nº de Novas Startups', unit: 'UNIDADE', value_type: 'INTEGER', value: '7', annual_aggregation: 'SUM', monthly_values: [{ month: 1, value: '0' }, { month: 3, value: '7' }] },
  { code: 'MANTENEDORES', name: 'Nº de Mantenedores', unit: 'ORGANIZAÇÃO', value_type: 'INTEGER', value: '3', annual_aggregation: 'COUNT', monthly_values: [] },
  { code: 'RECEITA_TOTAL_CENTRO', name: 'Receita Total do Centro', unit: 'BRL', value_type: 'CURRENCY', value: null, monthly_values: [] },
  { code: 'OCUPACAO_PREDIO', name: 'Ocupação do Prédio', unit: 'PERCENT', value_type: 'PERCENT', value: '0.95', monthly_values: [{ month: 3, value: '0.95' }] },
  { code: 'CUSTOM', name: 'Indicador fora da planilha', value: '999' },
];
const filters = { sourceType: 'SPREADSHEET_IMPORT', officialDashboard: 'true' };
const mount = () => render(<MemoryRouter initialEntries={['/indicadores?year=2026']}><IndicatorsPage /></MemoryRouter>);
const card = (name) => screen.getByRole('article', { name });

beforeEach(() => {
  vi.resetAllMocks();
  api.getInnovationCenters.mockResolvedValue([{ id: 'a', name: 'Centro A' }, { id: 'b', name: 'Centro B' }]);
  api.getIndicatorHistory.mockResolvedValue(['2026', '2025']);
  api.getIndicators.mockImplementation(async ({ year }) => year === '2026' ? rows : []);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('dashboard de indicadores oficiais', () => {
  it('exibe erro e encerra o carregamento quando a consulta rejeita sem mensagem', async () => {
    api.getIndicators.mockRejectedValue(null);
    mount();
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível carregar indicadores.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('article', { name: rows[0].name })).toBeNull();
  });

  it('preserva os dados atuais e informa a falha apenas no comparativo', async () => {
    api.getIndicators.mockImplementation(({ year }) => year === '2026' ? Promise.resolve(rows) : Promise.reject(new Error('Ano anterior indisponível')));
    mount();
    await screen.findByRole('article', { name: rows[0].name });
    expect((await screen.findByRole('status')).textContent).toBe('Comparativo indisponível: não foi possível consultar o ano anterior.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ordena anos numericamente em ordem decrescente, mantendo strings e removendo duplicatas', async () => {
    const history = [999, '10000', 2025, '2026', 2025];
    api.getIndicatorHistory.mockResolvedValue(history);
    mount(); await screen.findByRole('article', { name: rows[0].name });

    expect(within(screen.getByLabelText('Ano')).getAllByRole('option').map((option) => option.value))
      .toEqual(['10000', '2026', '2025', '999']);
    expect(screen.getByLabelText('Ano').value).toBe('2026');
    expect(history).toEqual([999, '10000', 2025, '2026', 2025]);
  });

  it('mostra consolidado, série Jan–Dez, lacunas e zero registrado', async () => {
    mount(); await screen.findByRole('article', { name: 'Nº de Novas Startups' });
    const item = card('Nº de Novas Startups');
    expect(within(item).getByText('7', { selector: 'strong' })).toBeTruthy();
    const chart = within(item).getByRole('img', { name: 'Série mensal de Nº de Novas Startups' });
    expect(chart.querySelectorAll('circle')).toHaveLength(2);
    expect(chart.querySelector('path').getAttribute('d').match(/M/g)).toHaveLength(2);
    expect(chart.querySelector('path').getAttribute('d')).not.toContain('L');
    expect(within(item).getByText('Jan', { selector: 'dt' })).toBeTruthy();
    expect(within(item).getByText('Dez', { selector: 'dt' })).toBeTruthy();
    expect(within(item).getByText('0', { selector: 'dd' })).toBeTruthy();
    expect(within(item).getAllByText('Sem dados')).toHaveLength(10);
    expect(screen.queryByText('Indicador fora da planilha')).toBeNull();
    expect(api.getIndicators).toHaveBeenCalledWith({ centerId: 'a', year: '2026', ...filters });
  });

  it('mostra indicador anual sem inventar uma série mensal', async () => {
    mount(); await screen.findByRole('article', { name: 'Nº de Mantenedores' });
    expect(within(card('Nº de Mantenedores')).getByText('3')).toBeTruthy();
    expect(within(card('Nº de Mantenedores')).queryByRole('img')).toBeNull();
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '3' } });
    expect(within(card('Nº de Mantenedores')).getByText('Sem dados')).toBeTruthy();
    expect(within(card('Nº de Novas Startups')).getByText('7', { selector: 'strong' })).toBeTruthy();
  });

  it('mantém ausência de dados como Sem dados, inclusive ao selecionar mês vazio', async () => {
    mount(); await screen.findByRole('article', { name: 'Receita Total do Centro' });
    expect(within(card('Receita Total do Centro')).getByText('Sem dados')).toBeTruthy();
    expect(within(card('Receita Total do Centro')).queryByText(/R\$/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '2' } });
    expect(within(card('Nº de Novas Startups')).getByText('Sem dados', { selector: 'strong' })).toBeTruthy();
  });

  it('mostra Jan–Dez sem pontos para uma definição mensal sem dados', async () => {
    api.getIndicators.mockResolvedValue([{ ...rows[2], periodicity: 'MONTHLY' }]);
    mount(); await screen.findByRole('article', { name: 'Receita Total do Centro' });
    const chart = within(card('Receita Total do Centro')).getByRole('img', { name: 'Sem dados mensais de Receita Total do Centro' });
    expect(chart.querySelectorAll('circle, path')).toHaveLength(0);
    expect(within(chart).getByText('Jan')).toBeTruthy();
    expect(within(chart).getByText('Dez')).toBeTruthy();
    expect(within(card('Receita Total do Centro')).getByText('Sem dados', { selector: 'strong' })).toBeTruthy();
  });

  it('identifica o consolidado anual registrado na planilha sem recalculá-lo no frontend', async () => {
    api.getIndicators.mockResolvedValue([{ ...rows[0], value: '12', consolidation_basis: 'RECORDED_ANNUAL' }]);
    mount(); await screen.findByRole('article', { name: 'Nº de Novas Startups' });
    expect(within(card('Nº de Novas Startups')).getByText('12', { selector: 'strong' })).toBeTruthy();
    expect(within(card('Nº de Novas Startups')).getByText('2026 · Consolidado anual da planilha')).toBeTruthy();
  });

  it('filtra cards, gráficos e distribuição por categoria', async () => {
    mount(); await screen.findByRole('article', { name: 'Receita Total do Centro' });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Financeiro' } });
    expect(card('Receita Total do Centro')).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Nº de Novas Startups' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Residentes' })).toBeNull();
    expect(screen.getByText('0 de 1')).toBeTruthy();
  });

  it('consulta o ano selecionado e remove valores do ano anterior', async () => {
    mount(); await screen.findByRole('article', { name: 'Nº de Novas Startups' });
    api.getIndicators.mockImplementation(async () => rows.map((row) => ({ ...row, value: null, monthly_values: [] })));
    fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2025' } });
    await waitFor(() => expect(api.getIndicators).toHaveBeenCalledWith({ centerId: 'a', year: '2025', ...filters }));
    await waitFor(() => expect(within(card('Nº de Novas Startups')).getByText('Sem dados')).toBeTruthy());
    expect(screen.queryByRole('img', { name: /Série mensal/ })).toBeNull();
  });

  it('consulta o centro selecionado e ignora respostas tardias', async () => {
    let resolve;
    const delayed = new Promise((done) => { resolve = done; });
    api.getIndicators.mockImplementation(({ centerId }) => centerId === 'a' ? delayed : Promise.resolve(rows.map((row) => ({ ...row, name: `B: ${row.name}` }))));
    mount(); await screen.findByRole('option', { name: 'Centro B' });
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'b' } });
    await screen.findByRole('article', { name: 'B: Nº de Novas Startups' });
    expect(api.getIndicators).toHaveBeenCalledWith({ centerId: 'b', year: '2026', ...filters });
    await act(async () => { resolve(rows); await delayed; });
    expect(screen.queryByRole('article', { name: 'Nº de Novas Startups' })).toBeNull();
  });

  it('compara apenas valores conhecidos e não calcula variação sobre zero', async () => {
    api.getIndicators.mockImplementation(async ({ year }) => year === '2026' ? rows : rows.map((row) => ({ ...row, value: '0' })));
    mount(); await screen.findByRole('article', { name: 'Nº de Novas Startups' });
    expect(screen.getAllByText('2025 · 0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Variação: Sem dados').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull();
    expect(within(card('Ocupação do Prédio')).getByText('95%', { selector: 'strong' })).toBeTruthy();
  });

  it('exporta exatamente os códigos oficiais da categoria e período selecionados', async () => {
    api.downloadIndicatorReport.mockResolvedValue({ blob: new Blob(['report']), filename: 'indicadores.csv' });
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:report'), revokeObjectURL: revoke }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount(); await screen.findByRole('article', { name: 'Receita Total do Centro' });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Financeiro' } });
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(api.downloadIndicatorReport).toHaveBeenCalledWith('csv', { centerId: 'a', year: '2026', period: '2026-03', ...filters, codes: 'RECEITA_TOTAL_CENTRO' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:report'));
  });

  it('exibe falhas do centro e da consulta sem reutilizar valores', async () => {
    api.getInnovationCenters.mockRejectedValue(new Error('Falha nos centros'));
    mount(); expect((await screen.findByRole('alert')).textContent).toBe('Falha nos centros');
    expect(api.getIndicators).not.toHaveBeenCalled();
    cleanup(); api.getInnovationCenters.mockResolvedValue([{ id: 'a', name: 'Centro A' }]);
    api.getIndicators.mockRejectedValue(new Error('Falha nos indicadores'));
    mount(); expect((await screen.findByRole('alert')).textContent).toBe('Falha nos indicadores');
    expect(screen.queryByRole('article', { name: 'Nº de Novas Startups' })).toBeNull();
  });

  it('exporta PDF com todos os códigos do recorte, centro, ano, período, categoria e origem', async () => {
    const codes = indicatorBlocks.flatMap((block) => block.codes);
    api.getIndicators.mockResolvedValue(codes.map((code) => ({ ...rows[0], code, name: `Teste ${code}`, periodicity: 'ANNUAL', monthly_values: [] })));
    api.downloadIndicatorReport.mockResolvedValue({ blob: new Blob(['pdf']), filename: 'indicadores.pdf' });
    const create = vi.fn(() => 'blob:pdf'); const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount(); await screen.findByRole('article', { name: `Teste ${codes[0]}` });
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'b' } });
    fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2025' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'PDF' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(api.downloadIndicatorReport).toHaveBeenCalledWith('pdf', { centerId: 'b', year: '2025', period: '2025', ...filters, codes: codes.join(','), categoryLabel: 'Todas' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:pdf'));
    expect(click).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Financeiro' } });
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(api.downloadIndicatorReport).toHaveBeenLastCalledWith('pdf', { centerId: 'b', year: '2025', period: '2025-03', ...filters, codes: indicatorBlocks.find((block) => block.name === 'Financeiro').codes.join(','), categoryLabel: 'Financeiro' }));
  });

  it('exibe erro de exportação PDF e permite tentar novamente', async () => {
    api.downloadIndicatorReport.mockRejectedValue(new Error('Falha ao gerar PDF'));
    mount(); await screen.findByRole('article', { name: 'Nº de Novas Startups' });
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Falha ao gerar PDF');
    await waitFor(() => expect(screen.getByRole('button', { name: 'PDF' }).disabled).toBe(false));
  });
});
