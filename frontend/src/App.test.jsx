import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  getFormIndicatorDefinitions: vi.fn(),
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
  getFormIndicatorDefinitions: api.getFormIndicatorDefinitions,
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
  api.getFormIndicatorDefinitions.mockResolvedValue([]);
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
  it('preserva centerId ao redirecionar a rota /indicadores', async () => {
    api.getInnovationCenters.mockResolvedValue([
      { id: 'blumenau', code: 'CI_BLUMENAU', name: 'Centro de Inovação de Blumenau' },
      { id: 'joinville', code: 'CI_JOINVILLE', name: 'Centro de Inovação de Joinville' },
    ]);
    window.history.replaceState({}, '', '/indicadores?centerId=blumenau&year=2026');
    render(<App />);
    await waitFor(() => expect(api.getIndicators).toHaveBeenCalledWith(expect.objectContaining({ centerId: 'blumenau', year: '2026' })));
    expect(window.location.pathname).toBe('/indicators');
    expect(new URLSearchParams(window.location.search).get('centerId')).toBe('blumenau');
  });
  it.each(['', '?centerId=blumenau', '?centerId=invalid'])('preserva o default e a seleção explícita no cadastro de indicadores: %s', async (query) => {
    const names = (await import('../../backend/tests/fixtures/innovation-center-names.json')).default;
    const centers = names.map((name, index) => ({ id: index === 10 ? 'joinville-original' : index === 2 ? 'blumenau' : `center-${index}`, code: index === 10 ? 'CI_JOINVILLE' : `CI_${index}`, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    api.getInnovationCenters.mockResolvedValue(centers);
    window.history.replaceState({}, '', `/forms/new${query}`);
    render(<App />);
    const select = await screen.findByLabelText('Centro');
    await waitFor(() => expect(select.value).toBe(query === '?centerId=blumenau' ? 'blumenau' : 'joinville-original'));
    expect(Array.from(select.options).filter((option) => option.value).map((option) => option.textContent)).toEqual(centers.map((center) => center.name));
    fireEvent.change(select, { target: { value: 'center-1' } });
    expect(select.value).toBe('center-1');
    expect(new URLSearchParams(window.location.search).get('centerId')).toBe('center-1');
  });
  it.each(['/indicadores', '/indicators'])('abre o dashboard oficial em %s', async (path) => {
    api.getInnovationCenters.mockResolvedValue([{ id: 'center-a', code: 'CI_JOINVILLE', name: 'Centro A' }]);
    api.getIndicators.mockResolvedValue([{ code: 'EVENTOS_REALIZADOS', name: 'Nº de Eventos Realizados', value: null, monthly_values: [] }]);
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeTruthy();
    expect(screen.getAllByText('Sem dados').length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe('/indicators');
    expect(api.getIndicators).toHaveBeenCalledWith(expect.objectContaining({ centerId: 'center-a', sourceType: 'SPREADSHEET_IMPORT', officialDashboard: 'true' }));
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
