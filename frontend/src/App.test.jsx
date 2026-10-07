import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  value: {
    user: { id: '1', name: 'Admin Teste', role: 'ADMIN', organizations: [] },
    loading: false,
    logout: vi.fn(),
  },
}));
const api = vi.hoisted(() => ({
  getAccessRequests: vi.fn(),
  getIndicators: vi.fn(),
  getIndicatorHistory: vi.fn(),
  getInnovationCenters: vi.fn(),
  downloadIndicatorReport: vi.fn(),
  getOrganizations: vi.fn(),
  getUsers: vi.fn(),
  getEligibleFormRecipients: vi.fn(),
  createForm: vi.fn(),
  addFormQuestion: vi.fn(),
  saveFormAudience: vi.fn(),
}));

vi.mock('./contexts/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('./contexts/AuthContext.jsx', () => ({ useAuth: () => auth.value }));
vi.mock('./services/api', async (original) => ({
  ...(await original()),
  getAccessRequests: api.getAccessRequests,
  getIndicators: api.getIndicators,
  getIndicatorHistory: api.getIndicatorHistory,
  getInnovationCenters: api.getInnovationCenters,
  downloadIndicatorReport: api.downloadIndicatorReport,
  getOrganizations: api.getOrganizations,
  getUsers: api.getUsers,
  getEligibleFormRecipients: api.getEligibleFormRecipients,
  createForm: api.createForm,
  addFormQuestion: api.addFormQuestion,
  saveFormAudience: api.saveFormAudience,
}));

import App from './App';

beforeEach(() => {
  api.getAccessRequests.mockResolvedValue([]);
  api.getIndicators.mockResolvedValue([]);
  api.getIndicatorHistory.mockResolvedValue([]);
  api.getInnovationCenters.mockResolvedValue([]);
  api.getOrganizations.mockResolvedValue([]);
  api.getUsers.mockResolvedValue([]);
  api.getEligibleFormRecipients.mockResolvedValue([]);
  api.createForm.mockResolvedValue({ id: 'form-1' });
  api.addFormQuestion.mockResolvedValue({ id: 'question-1' });
  api.saveFormAudience.mockResolvedValue({});
  auth.value = {
    user: { id: '1', name: 'Admin Teste', role: 'ADMIN', organizations: [] },
    loading: false,
    logout: vi.fn(),
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('roteamento principal', () => {
  it('exibe a falha ao carregar centros sem consultar indicadores', async () => {
    api.getInnovationCenters.mockRejectedValueOnce(new Error('Falha nos centros'));
    const calls = api.getIndicators.mock.calls.length;
    window.history.replaceState({}, '', '/indicators');
    render(<App />);
    expect(await screen.findByText('Falha nos centros')).toBeTruthy();
    expect(api.getIndicators.mock.calls).toHaveLength(calls);
  });

  it('exibe a rejeição da consulta de indicadores do centro', async () => {
    api.getInnovationCenters.mockResolvedValue([{ id: 'center-a', name: 'Centro A' }]);
    api.getIndicators.mockRejectedValueOnce(new Error('Falha nos indicadores'));
    window.history.replaceState({}, '', '/indicators');
    render(<App />);
    expect(await screen.findByText('Falha nos indicadores')).toBeTruthy();
  });

  it('ignora a resposta tardia do centro anterior', async () => {
    let resolvePrevious;
    const previous = new Promise((resolve) => { resolvePrevious = resolve; });
    api.getInnovationCenters.mockResolvedValue([{ id: 'center-a', name: 'Centro A' }, { id: 'center-b', name: 'Centro B' }]);
    api.getIndicators.mockImplementation(({ centerId }) => centerId === 'center-a' ? previous : Promise.resolve([
      { id: 'b', name: 'Indicador atual', value: 2, source: 'SYSTEM_CALCULATION' },
    ]));
    window.history.replaceState({}, '', '/indicators');
    render(<App />);
    await waitFor(() => expect(api.getIndicators).toHaveBeenLastCalledWith({ centerId: 'center-a' }));
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'center-b' } });
    expect(await screen.findByText('Indicador atual')).toBeTruthy();
    await act(async () => { resolvePrevious([{ id: 'a', name: 'Indicador antigo', value: 1 }]); await previous; });
    expect(screen.queryByText('Indicador antigo')).toBeNull();
    expect(screen.getByText('Indicador atual')).toBeTruthy();
  });

  it('exporta os indicadores com o centro e o período selecionados', async () => {
    api.getInnovationCenters.mockResolvedValue([{ id: 'center-a', name: 'Centro A' }]);
    api.getIndicatorHistory.mockResolvedValue(['2025']);
    api.downloadIndicatorReport.mockResolvedValue({ blob: new Blob(['report']), filename: 'indicadores.csv' });
    const createObjectURL = vi.fn(() => 'blob:report');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    window.history.replaceState({}, '', '/indicators');
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-a'));
    const period = (await screen.findByRole('option', { name: '2025' })).parentElement;
    fireEvent.change(period, { target: { value: '2025' } });
    await waitFor(() => expect(api.getIndicators).toHaveBeenLastCalledWith({ centerId: 'center-a', period: '2025' }));
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(api.downloadIndicatorReport).toHaveBeenLastCalledWith('csv', { centerId: 'center-a', period: '2025' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
    expect(click.mock.instances[0].download).toBe('indicadores.csv');
  });

  it('consulta a fonte consolidada do centro selecionado em Indicadores', async () => {
    api.getInnovationCenters.mockResolvedValue([{ id: 'center-a', name: 'Centro A' }, { id: 'center-b', name: 'Centro B' }]);
    api.getIndicatorHistory.mockResolvedValue(['2026']);
    api.getIndicators.mockImplementation(async ({ centerId }) => [{
      id: centerId, code: 'EVENTOS_REALIZADOS', name: `Eventos ${centerId}`,
      value: centerId === 'center-a' ? 1 : 2, value_type: 'INTEGER', unit: 'UNIDADE',
      category: 'Eventos', period: '2026', source: 'SYSTEM_CALCULATION',
    }]);
    window.history.replaceState({}, '', '/indicators');
    render(<App />);
    expect(await screen.findByText('Eventos center-a')).toBeTruthy();
    expect(api.getIndicators).toHaveBeenLastCalledWith({ centerId: 'center-a' });
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'center-b' } });
    expect(await screen.findByText('Eventos center-b')).toBeTruthy();
    expect(api.getIndicators).toHaveBeenLastCalledWith({ centerId: 'center-b' });
  });

  it('renderiza layout, menu e painel do ADMIN em /admin', async () => {
    window.history.replaceState({}, '', '/admin');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Solicitações de acesso' })).toBeTruthy();
    expect(screen.getByText('Admin Teste')).toBeTruthy();
    expect(screen.getByRole('button', { name: /solicitações/i })).toBeTruthy();
  });

  it('preserva a rota administrativa antiga com redirecionamento', async () => {
    window.history.replaceState({}, '', '/admin/requests');

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/admin/solicitacoes'));
    expect(await screen.findByText('Nenhuma solicitação pendente.')).toBeTruthy();
  });

  it('exibe estado seguro para rota inexistente', () => {
    auth.value = { ...auth.value, user: null };
    window.history.replaceState({}, '', '/rota-inexistente');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeTruthy();
  });

  it('abre a tela de usuários e carrega a listagem', async () => {
    api.getUsers.mockResolvedValue([{ id: '2', name: 'Pessoa Teste', email: 'pessoa@test.com', role: 'GESTOR', status: 'ACTIVE' }]);
    window.history.replaceState({}, '', '/admin/usuarios');
    render(<App />);
    expect(await screen.findByText('Pessoa Teste')).toBeTruthy();
    expect(api.getUsers).toHaveBeenCalledOnce();
  });

  it('salva rascunho sem tentar cadastrar a pergunta inicial vazia', async () => {
    window.history.replaceState({}, '', '/forms/new');
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('Título do formulário'), { target: { value: 'Novo formulário' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(api.createForm).toHaveBeenCalledOnce());
    expect(api.addFormQuestion).not.toHaveBeenCalled();
    await waitFor(() => expect(window.location.pathname).toBe('/forms'));
  });

});
