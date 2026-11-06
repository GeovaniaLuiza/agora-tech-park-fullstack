import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

const auth = vi.hoisted(() => ({
  value: {
    user: { id: '1', name: 'Admin Teste', role: 'ADMIN', organizations: [] },
    loading: false,
    logout: vi.fn(),
  },
}));
const api = vi.hoisted(() => ({
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  getAccessRequest: vi.fn(),
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
  addQuestionOption: vi.fn(),
  getForms: vi.fn(),
  getForm: vi.fn(),
  getFormQuestions: vi.fn(),
  getFormOrganizations: vi.fn(),
  getFormRespondents: vi.fn(),
  updateForm: vi.fn(),
  updateFormQuestion: vi.fn(),
  publishForm: vi.fn(),
  saveFormAudience: vi.fn(),
}));

vi.mock('./contexts/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('./contexts/AuthContext.jsx', () => ({ useAuth: () => auth.value }));
vi.mock('./services/api', async (original) => ({
  ...(await original()),
  getNotifications: api.getNotifications,
  markNotificationRead: api.markNotificationRead,
  getAccessRequest: api.getAccessRequest,
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
  addQuestionOption: api.addQuestionOption,
  getForms: api.getForms,
  getForm: api.getForm,
  getFormQuestions: api.getFormQuestions,
  getFormOrganizations: api.getFormOrganizations,
  getFormRespondents: api.getFormRespondents,
  updateForm: api.updateForm,
  updateFormQuestion: api.updateFormQuestion,
  publishForm: api.publishForm,
  saveFormAudience: api.saveFormAudience,
}));

import App from './App';

beforeEach(() => {
<<<<<<< HEAD
  api.getNotifications.mockResolvedValue([]);
=======
  vi.clearAllMocks();
  api.getForms.mockResolvedValue([]);
  api.getForm.mockResolvedValue({ id: 'form-1', title: 'Coleta existente', status: 'DRAFT' });
  api.getFormQuestions.mockResolvedValue([]);
  api.getFormOrganizations.mockResolvedValue([]);
  api.getFormRespondents.mockResolvedValue([]);
  api.updateForm.mockResolvedValue({ id: 'form-1' });
  api.publishForm.mockResolvedValue({ notificationSummary: { sent: 1, failed: 0 } });
>>>>>>> origin/main
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
  api.updateFormQuestion.mockImplementation(async (_formId, id) => ({ id }));
  api.addQuestionOption.mockReset().mockResolvedValue({ id: 'option-1' });
  api.saveFormAudience.mockResolvedValue({});
  auth.value = {
    user: { id: '1', name: 'Admin Teste', role: 'ADMIN', organizations: [] },
    loading: false,
    logout: vi.fn(),
  };
});

describe('busca e seleÃ§Ã£o explÃ­cita de respondentes', () => {
  const organizations = [{ id: 'org-a', name: 'Empresa XPTO', status: 'ACTIVE' }, { id: 'org-b', name: 'Universidade ABC', status: 'ACTIVE' }];
  const residents = [
    { id: 'maria', name: 'Maria Silva', email: 'maria@empresa.example', organizations: [organizations[0]] },
    { id: 'joao', name: 'JoÃ£o Souza', email: 'joao@universidade.example', organizations: [organizations[1]] },
    { id: 'lucas', name: 'Lucas Lima', email: 'lucas@empresa.example', organizations },
  ];
  const openPicker = async ({ editing = false, targets = null, selected = [], eligible = residents, open = true } = {}) => {
    const targetIds = targets ?? ['org-a', 'org-b'];
    api.getOrganizations.mockResolvedValue(organizations);
    api.getEligibleFormRecipients.mockImplementation(async (organizationIds) => eligible.filter((person) => person.organizations.some((organization) => organizationIds.includes(organization.id))));
    api.getFormOrganizations.mockResolvedValue(organizations.filter((organization) => targetIds.includes(organization.id)));
    api.getFormRespondents.mockResolvedValue(selected.map((person) => ({ user_id: person.id, name: person.name, email: person.email, organization_id: person.organizations?.[0]?.id || 'org-a' })));
    window.history.replaceState({}, '', editing ? '/forms/form-1/edit' : '/forms/new');
    render(<App />);
    if (editing) await screen.findByDisplayValue('Coleta existente');
    else fireEvent.change(screen.getByPlaceholderText('TÃ­tulo do formulÃ¡rio'), { target: { value: 'Pesquisa de satisfaÃ§Ã£o' } });
    const group = screen.getByRole('group', { name: 'RESPONDENTES' });
    if (!editing) {
      for (const organizationId of targetIds) {
        const organization = organizations.find(({ id }) => id === organizationId);
        fireEvent.click(await screen.findByRole('checkbox', { name: new RegExp(organization.name) }));
      }
    }
    const scoped = targetIds.length ? eligible.filter((person) => person.organizations.some((organization) => targetIds.includes(organization.id))) : [];
    if (targetIds.length) await within(group).findByText(scoped.length
      ? `${scoped.length} respondente(s) disponÃ­vel(is)`
      : 'Nenhum respondente com vÃ­nculo ativo e e-mail vÃ¡lido foi encontrado para as organizaÃ§Ãµes selecionadas.');
    if (open && targetIds.length && scoped.length) {
      const trigger = within(group).getByRole('button', { name: 'Selecionar respondentes' });
      if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
      await within(group).findByRole('searchbox', { name: 'Buscar por nome ou e-mail' });
    }
    if (!open) {
      const trigger = within(group).getByRole('button', { name: 'Selecionar respondentes' });
      if (trigger.getAttribute('aria-expanded') === 'true') fireEvent.click(trigger);
    }
    return within(group).queryByRole('searchbox', { name: 'Buscar por nome ou e-mail' });
  };
  const query = (input, value) => fireEvent.change(input, { target: { value } });
  const emailOption = () => screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ });

  it('explica como as organizaÃ§Ãµes definem os residentes vinculados que podem receber o formulÃ¡rio', async () => {
    await openPicker({ targets: [], open: false });
    const organizationsGroup = screen.getByRole('group', { name: 'OrganizaÃ§Ãµes destinatÃ¡rias' });
    expect(within(organizationsGroup).getByText('Selecione uma ou mais organizaÃ§Ãµes para definir quais residentes poderÃ£o receber o formulÃ¡rio.')).toBeTruthy();
    const recipientsGroup = screen.getByRole('group', { name: 'RESPONDENTES' });
    expect(within(recipientsGroup).getByText('Somente residentes ativos, com e-mail vÃ¡lido e vÃ­nculo ativo em uma das organizaÃ§Ãµes destinatÃ¡rias selecionadas podem receber o formulÃ¡rio.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ }).disabled).toBe(true);
    expect(api.getEligibleFormRecipients).not.toHaveBeenCalled();
    expect(api.publishForm).not.toHaveBeenCalled();
  });
  it('opens the eligible options automatically after selecting an organization', async () => {
    await openPicker({ targets: [], open: false });
    fireEvent.click(await screen.findByRole('checkbox', { name: /^Empresa XPTO/ }));
    const maria = await screen.findByRole('checkbox', { name: /Maria Silva/ });
    expect(screen.getByRole('button', { name: 'Selecionar respondentes' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('searchbox').value).toBe('');
    expect(maria.closest('label').textContent).toContain(residents[0].name);
    expect(maria.closest('label').textContent).toContain(residents[0].email);
    expect(maria.closest('label').textContent).toContain(organizations[0].name);
    expect(maria.closest('label').textContent).not.toContain('org-a');
    expect(screen.queryByRole('checkbox', { name: /Jo.o Souza/ })).toBeNull();
    expect(api.getEligibleFormRecipients).toHaveBeenCalledWith(['org-a']);
  });

  it('uses only the latest backend eligibility response after organization changes', async () => {
    await openPicker({ targets: [], open: false });
    let resolveFirst;
    let resolveLatest;
    api.getEligibleFormRecipients.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLatest = resolve; }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /^Empresa XPTO/ }));
    await waitFor(() => expect(resolveFirst).toBeTypeOf('function'));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Universidade ABC/ }));
    await waitFor(() => expect(resolveLatest).toBeTypeOf('function'));
    await act(async () => resolveLatest([residents[1]]));
    expect(screen.getByRole('checkbox', { name: /Jo.o Souza/ })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Lucas Lima/ })).toBeNull();
    await act(async () => resolveFirst([residents[0]]));
    expect(screen.queryByRole('checkbox', { name: /Maria Silva/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Jo.o Souza/ })).toBeTruthy();
  });

  it('clears the list and email intent even if an obsolete request finishes later', async () => {
    await openPicker({ targets: ['org-a'] });
    fireEvent.click(screen.getByRole('checkbox', { name: /Maria Silva/ }));
    fireEvent.click(emailOption());
    let resolvePending;
    api.getEligibleFormRecipients.mockImplementationOnce(() => new Promise((resolve) => { resolvePending = resolve; }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Universidade ABC/ }));
    await waitFor(() => expect(resolvePending).toBeTypeOf('function'));
    expect(screen.queryByRole('checkbox', { name: /Maria Silva/ })).toBeNull();
    fireEvent.click(await screen.findByRole('checkbox', { name: /^Empresa XPTO/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Universidade ABC/ }));
    await act(async () => resolvePending(residents));
    expect(screen.queryByRole('checkbox', { name: /Maria Silva/ })).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(emailOption().checked).toBe(false);
    expect(emailOption().disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Selecionar respondentes' }).disabled).toBe(true);
  });

  it('mostra a lista completa ao abrir, sem exigir busca, e exibe disponibilidade antes de filtrar', async () => {
    const input = await openPicker();
    expect(input.value).toBe('');
    expect(screen.getByText('3 respondente(s) disponÃ­vel(is)')).toBeTruthy();
    expect(screen.getByText('3 respondente(s) encontrado(s)')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Maria Silva/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /JoÃ£o Souza/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Lucas Lima/ })).toBeTruthy();
    expect(api.getEligibleFormRecipients).toHaveBeenCalledWith(['org-a', 'org-b']);
    const calls = api.getEligibleFormRecipients.mock.calls.length;
    query(input, 'maria');
    expect(api.getEligibleFormRecipients).toHaveBeenCalledTimes(calls);
  });

  it('distingue ausÃªncia de organizaÃ§Ã£o da ausÃªncia de residentes elegÃ­veis', async () => {
    await openPicker({ targets: [], open: false });
    expect(screen.getByText('Selecione ao menos uma organizaÃ§Ã£o destinatÃ¡ria para visualizar os respondentes vinculados.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Selecionar respondentes' }).disabled).toBe(true);
    expect(api.getEligibleFormRecipients).not.toHaveBeenCalled();

    cleanup();
    await openPicker({ targets: ['org-a'], eligible: [], open: false });
    await screen.findByText('Nenhum respondente com vÃ­nculo ativo e e-mail vÃ¡lido foi encontrado para as organizaÃ§Ãµes selecionadas.');
    expect(screen.queryByRole('searchbox', { name: 'Buscar por nome ou e-mail' })).toBeNull();
  });

  it('abre, fecha e permite continuar a seleÃ§Ã£o por teclado', async () => {
    const user = userEvent.setup();
    await openPicker({ targets: ['org-a'], open: false });
    const trigger = screen.getByRole('button', { name: 'Selecionar respondentes' });
    trigger.focus();
    await user.keyboard(' ');
    expect(screen.getByRole('searchbox', { name: 'Buscar por nome ou e-mail' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('searchbox', { name: 'Buscar por nome ou e-mail' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await user.keyboard(' ');
    expect(screen.getByRole('searchbox', { name: 'Buscar por nome ou e-mail' })).toBeTruthy();
  });

  it('busca nomes sem distinguir caixa ou acentos e mostra e-mail e organizaÃ§Ã£o', async () => {
    const input = await openPicker();
    query(input, ' MARIA ');
    const maria = screen.getByRole('checkbox', { name: /Maria Silva/ });
    expect(maria.closest('label').textContent).toContain('maria@empresa.example');
    expect(maria.closest('label').textContent).toContain('Empresa XPTO');
    expect(screen.queryByRole('checkbox', { name: /JoÃ£o Souza/ })).toBeNull();
    expect(screen.getByText('1 respondente(s) encontrado(s)')).toBeTruthy();
    query(input, 'joao');
    expect(screen.getByRole('checkbox', { name: /JoÃ£o Souza/ })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Maria Silva/ })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('busca por e-mail e permite limpar a busca sem mudar a audiÃªncia', async () => {
    const input = await openPicker();
    query(input, ' JOAO@UNIVERSIDADE.EXAMPLE ');
    fireEvent.click(screen.getByRole('checkbox', { name: /JoÃ£o Souza/ }));
    expect(screen.queryByRole('checkbox', { name: /Maria Silva/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca de respondentes' }));
    expect(input.value).toBe('');
    expect(screen.getByText('3 respondente(s) encontrado(s)')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /JoÃ£o Souza/ }).checked).toBe(true);
    expect(screen.getByText('1 respondente(s) selecionado(s)')).toBeTruthy();
    expect(emailOption().checked).toBe(false);
  });

  it('seleciona em buscas diferentes, remove quem estÃ¡ oculto e salva sem enviar', async () => {
    const input = await openPicker();
    query(input, 'maria');
    fireEvent.click(screen.getByRole('checkbox', { name: /Maria Silva/ }));
    query(input, 'joao');
    fireEvent.click(screen.getByRole('checkbox', { name: /JoÃ£o Souza/ }));
    expect(screen.getByText('2 respondente(s) selecionado(s)')).toBeTruthy();
    query(input, 'ninguÃ©m com este nome');
    expect(screen.getByText('Nenhum respondente encontrado para esta busca.')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Respondentes selecionados' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Remover respondente Maria Silva/ }));
    expect(screen.getByText('1 respondente(s) selecionado(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    await screen.findByText('FormulÃ¡rio salvo com sucesso.');
    expect(api.saveFormAudience).toHaveBeenCalledWith('form-1', ['org-a', 'org-b'], ['joao']);
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it('a busca sÃ³ filtra a apresentaÃ§Ã£o e o envio usa todas as pessoas selecionadas', async () => {
    api.publishForm.mockResolvedValue({ notificationSummary: { sent: 2, failed: 0 } });
    const input = await openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: /Maria Silva/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /JoÃ£o Souza/ }));
    fireEvent.click(emailOption());
    query(input, 'sem resultados');
    expect(emailOption().checked).toBe(true);
    expect(screen.getByText('2 respondente(s) selecionado(s)')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Texto da pergunta'), { target: { value: 'Como avalia o parque?' } });
    fireEvent.change(screen.getByLabelText('InÃ­cio'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await screen.findByText('FormulÃ¡rio salvo e enviado para 2 respondente(s).');
    expect(api.publishForm).toHaveBeenCalledWith('form-1', ['org-a', 'org-b'], ['maria', 'joao']);
    expect(api.publishForm).toHaveBeenCalledOnce();
  });

  it('remoÃ§Ã£o individual atualiza o contador e cancela o envio apenas na Ãºltima pessoa', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: /Maria Silva/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /JoÃ£o Souza/ }));
    fireEvent.click(emailOption());
    fireEvent.click(screen.getByRole('button', { name: /Remover respondente Maria Silva/ }));
    expect(emailOption().checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: /Maria Silva/ }).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Remover respondente JoÃ£o Souza/ }));
    expect(screen.getByText('0 respondente(s) selecionado(s)')).toBeTruthy();
    expect(emailOption().checked).toBe(false);
    expect(emailOption().disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    expect(screen.queryByRole('list', { name: 'Respondentes selecionados' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('combina busca e organizaÃ§Ãµes e limpa seleÃ§Ãµes ao remover a Ãºltima organizaÃ§Ã£o', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: /Maria Silva/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /JoÃ£o Souza/ }));
    fireEvent.click(emailOption());
    fireEvent.click(screen.getByRole('checkbox', { name: /^Empresa XPTO/ }));
    expect(screen.queryByRole('button', { name: /Remover respondente Maria Silva/ })).toBeNull();
    expect(screen.getByText('1 respondente(s) selecionado(s)')).toBeTruthy();
    expect(emailOption().checked).toBe(true);
    await screen.findByText('2 respondente(s) disponÃ­vel(is)');
    if (screen.getByRole('button', { name: 'Selecionar respondentes' }).getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(screen.getByRole('button', { name: 'Selecionar respondentes' }));
    }
    const filteredInput = await screen.findByRole('searchbox', { name: 'Buscar por nome ou e-mail' });
    query(filteredInput, 'universidade.example');
    expect(screen.getByRole('checkbox', { name: /JoÃ£o Souza/ })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Maria Silva/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /^Universidade ABC/ }));
    expect(screen.getByText('0 respondente(s) selecionado(s)')).toBeTruthy();
    expect(emailOption().checked).toBe(false);
    expect(emailOption().disabled).toBe(true);
    expect(screen.queryByRole('checkbox', { name: /JoÃ£o Souza/ })).toBeNull();
    expect(screen.getByText('Selecione ao menos uma organizaÃ§Ã£o destinatÃ¡ria para visualizar os respondentes vinculados.')).toBeTruthy();
  });

  it('preserva quem continua vinculado a uma organizaÃ§Ã£o destinatÃ¡ria ao remover outra', async () => {
    await openPicker({ editing: true, targets: ['org-a', 'org-b'], selected: [residents[2]] });
    fireEvent.click(emailOption());
    fireEvent.click(screen.getByRole('checkbox', { name: /^Empresa XPTO/ }));
    await screen.findByText('2 respondente(s) disponÃ­vel(is)');
    if (screen.getByRole('button', { name: 'Selecionar respondentes' }).getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(screen.getByRole('button', { name: 'Selecionar respondentes' }));
    }
    const lucas = screen.getByRole('checkbox', { name: /Lucas Lima/ });
    expect(lucas.checked).toBe(true);
    expect(lucas.closest('label').textContent).toContain('Universidade ABC');
    expect(lucas.closest('label').textContent).not.toContain('Empresa XPTO');
    expect(emailOption().checked).toBe(true);
    await screen.findByText('2 respondente(s) disponÃ­vel(is)');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Universidade ABC/ }));
    await screen.findByText('Selecione ao menos uma organizaÃ§Ã£o destinatÃ¡ria para visualizar os respondentes vinculados.');
    expect(emailOption().checked).toBe(false);
    expect(screen.getByText('0 respondente(s) selecionado(s)')).toBeTruthy();
  });

  it('permite remover uma atribuiÃ§Ã£o antiga que nÃ£o consta mais na lista de elegÃ­veis', async () => {
    await openPicker({ editing: true, targets: ['org-a'], eligible: [], selected: [{ id: 'old-user', name: 'Pessoa desligada', email: 'antigo@example.com' }] });
    expect(screen.getByText('Nenhum respondente com vÃ­nculo ativo e e-mail vÃ¡lido foi encontrado para as organizaÃ§Ãµes selecionadas.')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Pessoa desligada/ })).toBeNull();
    expect(screen.getByText('0 respondente(s) selecionado(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alteraÃ§Ãµes' }));
    await screen.findByText('FormulÃ¡rio salvo com sucesso.');
    expect(api.saveFormAudience).toHaveBeenCalledWith('form-1', ['org-a'], []);
    expect(api.publishForm).not.toHaveBeenCalled();
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('roteamento principal', () => {
  it.each(['resolve', 'reject'])('preserva requestId no clique com layout e guards reais e PATCH lento: %s', async (outcome) => {
    const link = '/admin/solicitacoes?requestId=req-123';
    const notification = { id: 'notification-123', title: 'Nova solicitaÃ§Ã£o de acesso', message: 'Pessoa aguarda anÃ¡lise.', link, read_at: null };
    api.getNotifications.mockResolvedValue([notification]);
    api.getAccessRequest.mockResolvedValue({ id: 'req-123', name: 'Pessoa selecionada', email: 'pessoa@test.com' });
    let resolveRead;
    let rejectRead;
    api.markNotificationRead.mockReturnValue(new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; }));
    window.history.replaceState({}, '', '/admin/solicitacoes');
    render(<App />);
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'NotificaÃ§Ãµes' }));
    await user.click(await screen.findByRole('button', { name: /Nova solicitaÃ§Ã£o de acesso/ }));
    expect(`${window.location.pathname}${window.location.search}`).toBe(link);
    expect(screen.queryByLabelText('Painel de notificaÃ§Ãµes')).toBeNull();
    expect(await screen.findByLabelText('SolicitaÃ§Ã£o de Pessoa selecionada')).toBeTruthy();

    await act(async () => {
      if (outcome === 'resolve') resolveRead({ ...notification, read_at: '2026-10-19T12:00:00Z' });
      else rejectRead(new Error('Falha no PATCH'));
    });
    expect(`${window.location.pathname}${window.location.search}`).toBe(link);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState.mock.calls[0][2]).toBe(link);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('preserva centerId ao redirecionar a rota /indicadores', async () => {
    api.getInnovationCenters.mockResolvedValue([
      { id: 'blumenau', code: 'CI_BLUMENAU', name: 'Centro de InovaÃ§Ã£o de Blumenau' },
      { id: 'joinville', code: 'CI_JOINVILLE', name: 'Centro de InovaÃ§Ã£o de Joinville' },
    ]);
    window.history.replaceState({}, '', '/indicadores?centerId=blumenau&year=2026');
    render(<App />);
    await waitFor(() => expect(api.getIndicators).toHaveBeenCalledWith(expect.objectContaining({ centerId: 'blumenau', year: '2026' })));
    expect(window.location.pathname).toBe('/indicators');
    expect(new URLSearchParams(window.location.search).get('centerId')).toBe('blumenau');
  });
  it.each(['', '?centerId=blumenau', '?centerId=invalid'])('preserva o default e a seleÃ§Ã£o explÃ­cita no cadastro de indicadores: %s', async (query) => {
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
    api.getIndicators.mockResolvedValue([{ code: 'EVENTOS_REALIZADOS', name: 'NÂº de Eventos Realizados', value: null, monthly_values: [] }]);
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'VisÃ£o geral' })).toBeTruthy();
    expect(screen.getAllByText('Sem dados').length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe('/indicators');
    expect(api.getIndicators).toHaveBeenCalledWith(expect.objectContaining({ centerId: 'center-a', sourceType: 'SPREADSHEET_IMPORT', officialDashboard: 'true' }));
  });
  it('renderiza layout, menu e painel do ADMIN em /admin', async () => {
    window.history.replaceState({}, '', '/admin');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'SolicitaÃ§Ãµes de acesso' })).toBeTruthy();
    expect(screen.getByText('Admin Teste')).toBeTruthy();
    expect(screen.getByRole('button', { name: /solicitaÃ§Ãµes/i })).toBeTruthy();
  });

  it('preserva a rota administrativa antiga com redirecionamento', async () => {
    window.history.replaceState({}, '', '/admin/requests');

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/admin/solicitacoes'));
    expect(await screen.findByText('Nenhuma solicitaÃ§Ã£o pendente.')).toBeTruthy();
  });

  it('exibe estado seguro para rota inexistente', () => {
    auth.value = { ...auth.value, user: null };
    window.history.replaceState({}, '', '/rota-inexistente');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'PÃ¡gina nÃ£o encontrada' })).toBeTruthy();
  });

  it('abre a tela de usuÃ¡rios e carrega a listagem', async () => {
    api.getUsers.mockResolvedValue([{ id: '2', name: 'Pessoa Teste', email: 'pessoa@test.com', role: 'GESTOR', status: 'ACTIVE' }]);
    window.history.replaceState({}, '', '/admin/usuarios');
    render(<App />);
    expect(await screen.findByText('Pessoa Teste')).toBeTruthy();
    expect(api.getUsers).toHaveBeenCalledOnce();
  });

  it('salva rascunho sem tentar cadastrar a pergunta inicial vazia', async () => {
    window.history.replaceState({}, '', '/forms/new');
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('TÃ­tulo do formulÃ¡rio'), { target: { value: 'Novo formulÃ¡rio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    await waitFor(() => expect(api.createForm).toHaveBeenCalledOnce());
    expect(api.addFormQuestion).not.toHaveBeenCalled();
    expect(await screen.findByText('FormulÃ¡rio salvo com sucesso.')).toBeTruthy();
    expect(api.publishForm).not.toHaveBeenCalled();
  });

});


describe('salvamento e envio de formulÃ¡rios', () => {
  const open = async (existing = false) => {
    window.history.replaceState({}, '', existing ? '/forms/form-1/edit' : '/forms/new');
    render(<App />);
    if (existing) await screen.findByDisplayValue('Coleta existente');
    else fireEvent.change(screen.getByPlaceholderText('TÃ­tulo do formulÃ¡rio'), { target: { value: 'Nova coleta' } });
  };
  const prepareSend = async (existing = false, sendEmail = true) => {
    api.getOrganizations.mockResolvedValue([{ id: 'org-1', name: 'Empresa A', status: 'ACTIVE' }]);
    api.getFormOrganizations.mockResolvedValue([{ id: 'org-1', name: 'Empresa A' }]);
    api.getEligibleFormRecipients.mockImplementation(async (organizationIds) => organizationIds.includes('org-1')
      ? [{ id: 'resident-1', name: 'Ana', email: 'ana@example.com', organizations: [{ id: 'org-1', name: 'Empresa A' }] }] : []);
    if (existing) api.getFormQuestions.mockResolvedValue([{ id: 'question-1', label: 'Sua resposta', type: 'TEXT', required: true }]);
    await open(existing);
    if (!existing) fireEvent.click(await screen.findByRole('checkbox', { name: /Empresa A/ }));
    await screen.findByText('1 respondente(s) disponÃ­vel(is)');
    fireEvent.change(screen.getByPlaceholderText('Texto da pergunta'), { target: { value: 'Sua resposta' } });
    fireEvent.change(screen.getByLabelText('InÃ­cio'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-12-31' } });
    if (screen.getByRole('button', { name: 'Selecionar respondentes' }).getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(screen.getByRole('button', { name: 'Selecionar respondentes' }));
    }
    fireEvent.click(await screen.findByRole('checkbox', { name: /Ana/ }));
    if (sendEmail) fireEvent.click(screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ }));
  };

  it('saves a new draft without an audience and leaves sending disabled', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    await screen.findByText('FormulÃ¡rio salvo com sucesso.');
    expect(api.saveFormAudience).toHaveBeenCalledWith('form-1', [], []);
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it('enables sending a complete new form only after explicit email intent without a prior save', async () => {
    await prepareSend(false, false);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    const email = screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ });
    expect(email.disabled).toBe(false);
    fireEvent.click(email);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(false);
    expect(api.createForm).not.toHaveBeenCalled();
    expect(api.getForm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('TÃ­tulo do formulÃ¡rio'), { target: { value: 'AB' } });
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('TÃ­tulo do formulÃ¡rio'), { target: { value: 'Nova coleta vÃ¡lida' } });
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(false);
  });

  it('creates, saves questions and audience, then publishes the same new ID before navigating', async () => {
    let finishAudience, finishPublish;
    api.createForm.mockResolvedValueOnce({ id: 'new-form-42', status: 'DRAFT' });
    api.saveFormAudience.mockImplementationOnce(() => new Promise((resolve) => { finishAudience = resolve; }));
    api.publishForm.mockImplementationOnce(() => new Promise((resolve) => { finishPublish = resolve; }));
    await prepareSend();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await waitFor(() => expect(api.saveFormAudience).toHaveBeenCalledWith('new-form-42', ['org-1'], ['resident-1']));
    expect(api.addFormQuestion).toHaveBeenCalledWith('new-form-42', expect.objectContaining({ label: 'Sua resposta' }));
    expect(api.createForm.mock.invocationCallOrder[0]).toBeLessThan(api.addFormQuestion.mock.invocationCallOrder[0]);
    expect(api.addFormQuestion.mock.invocationCallOrder[0]).toBeLessThan(api.saveFormAudience.mock.invocationCallOrder[0]);
    expect(api.publishForm).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/forms/new');
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    await act(async () => { finishAudience({}); });
    await waitFor(() => expect(api.publishForm).toHaveBeenCalledWith('new-form-42', ['org-1'], ['resident-1']));
    expect(api.saveFormAudience.mock.invocationCallOrder[0]).toBeLessThan(api.publishForm.mock.invocationCallOrder[0]);
    expect(window.location.pathname).toBe('/forms/new');
    await act(async () => { finishPublish({ notificationSummary: { sent: 1, failed: 0 } }); });
    await screen.findByText('FormulÃ¡rio salvo e enviado para 1 respondente(s).');
    expect(window.location.pathname).toBe('/forms');
    expect(api.createForm).toHaveBeenCalledOnce();
    expect(api.getForm).not.toHaveBeenCalled();
  });

  it('retries an audience failure using the created form and question without sending prematurely', async () => {
    api.saveFormAudience.mockRejectedValueOnce(new Error('Falha ao salvar destinatÃ¡rios'));
    await prepareSend();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await screen.findByText('Falha ao salvar destinatÃ¡rios');
    expect(api.publishForm).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ }).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await screen.findByText('FormulÃ¡rio salvo e enviado para 1 respondente(s).');
    expect(api.createForm).toHaveBeenCalledOnce();
    expect(api.updateForm).toHaveBeenCalledWith('form-1', expect.any(Object));
    expect(api.addFormQuestion).toHaveBeenCalledOnce();
    expect(api.updateFormQuestion).toHaveBeenCalledWith('form-1', 'question-1', expect.any(Object));
    expect(api.saveFormAudience).toHaveBeenCalledTimes(2);
    expect(api.publishForm).toHaveBeenCalledOnce();
  });

  it('saves without sending, restores the draft audience, and sends after fresh intent without content changes', async () => {
    api.getForms.mockResolvedValue([{ id: 'form-1', title: 'Nova coleta', status: 'DRAFT' }]);
    await prepareSend(false, false);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    await screen.findByText('FormulÃ¡rio salvo com sucesso.');
    expect(api.publishForm).not.toHaveBeenCalled();
    api.getForm.mockResolvedValue({ id: 'form-1', title: 'Nova coleta', status: 'DRAFT',
      start_date: '2026-10-01', end_date: '2026-12-31' });
    api.getFormQuestions.mockResolvedValue([{ id: 'question-1', label: 'Sua resposta', type: 'NUMBER', required: true }]);
    api.getFormRespondents.mockResolvedValue([{ user_id: 'resident-1', organization_id: 'org-1', status: 'PENDING' }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await screen.findByDisplayValue('Nova coleta');
    await screen.findByText('1 respondente(s) disponÃ­vel(is)');
    expect(screen.getByRole('checkbox', { name: /Empresa A/ }).checked).toBe(true);
    expect(screen.getByText('1 respondente(s) selecionado(s)')).toBeTruthy();
    expect(screen.getByPlaceholderText('Texto da pergunta').value).toBe('Sua resposta');
    const email = screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ });
    expect(email.checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    fireEvent.click(email);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await screen.findByText('FormulÃ¡rio salvo e enviado para 1 respondente(s).');
    expect(api.createForm).toHaveBeenCalledOnce();
    expect(api.updateForm).toHaveBeenCalledOnce();
    expect(api.publishForm).toHaveBeenCalledWith('form-1', ['org-1'], ['resident-1']);
  });

  it('initializes a new draft when navigating from the editor of a published form', async () => {
    api.getForm.mockResolvedValue({ id: 'form-1', title: 'Coleta publicada', status: 'ACTIVE' });
    window.history.replaceState({}, '', '/forms/form-1/edit');
    render(<App />);
    await screen.findByDisplayValue('Coleta publicada');
    expect(screen.getByRole('button', { name: 'Salvar alteraÃ§Ãµes' }).disabled).toBe(true);
    await act(async () => {
      window.history.pushState({}, '', '/forms/new');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByPlaceholderText('TÃ­tulo do formulÃ¡rio').value).toBe('');
    expect(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }).disabled).toBe(false);
  });

  it('edita sem respondente e restaura organizaÃ§Ãµes sem residentes', async () => {
    api.getOrganizations.mockResolvedValue([{ id: 'org-1', name: 'Empresa A', status: 'ACTIVE' }]);
    api.getFormOrganizations.mockResolvedValue([{ id: 'org-1' }]);
    await open(true);
    expect(screen.getByRole('checkbox', { name: /Empresa A/ }).checked).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await screen.findByText('Nenhum respondente com vÃ­nculo ativo e e-mail vÃ¡lido foi encontrado para as organizaÃ§Ãµes selecionadas.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alteraÃ§Ãµes' }));
    expect(await screen.findByText('FormulÃ¡rio salvo com sucesso.')).toBeTruthy();
    expect(api.updateForm).toHaveBeenCalledOnce();
    expect(api.saveFormAudience).toHaveBeenCalledWith('form-1', ['org-1'], []);
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it.each([false, true])('desabilita envio sem respondentes e permite salvar; existente=%s', async (existing) => {
    await open(existing);
    expect(screen.queryByText('Selecione ao menos um respondente para enviar o formulÃ¡rio.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ }).disabled).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.publishForm).not.toHaveBeenCalled();
    expect(api.createForm).not.toHaveBeenCalled();
    expect(api.updateForm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: existing ? 'Salvar alteraÃ§Ãµes' : 'Salvar formulÃ¡rio' }));
    expect(await screen.findByText('FormulÃ¡rio salvo com sucesso.')).toBeTruthy();
  });

  it('salvar com residentes selecionados nÃ£o envia convites', async () => {
    await prepareSend();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    expect(await screen.findByText('FormulÃ¡rio salvo com sucesso.')).toBeTruthy();
    expect(api.saveFormAudience).toHaveBeenCalledWith('form-1', ['org-1'], ['resident-1']);
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it('salva e envia um formulÃ¡rio existente', async () => {
    await prepareSend(true);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await screen.findByText('FormulÃ¡rio salvo e enviado para 1 respondente(s).');
    expect(api.createForm).not.toHaveBeenCalled();
    expect(api.updateForm).toHaveBeenCalledOnce();
    expect(api.publishForm).toHaveBeenCalledWith('form-1', ['org-1'], ['resident-1']);
  });

  it('destaca somente o campo de tÃ­tulo invÃ¡lido ao salvar', async () => {
    await open();
    fireEvent.change(screen.getByPlaceholderText('TÃ­tulo do formulÃ¡rio'), { target: { value: 'AB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    expect(screen.getByPlaceholderText('TÃ­tulo do formulÃ¡rio').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('InÃ­cio').getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText('Selecione ao menos um respondente para enviar o formulÃ¡rio.')).toBeNull();
    expect(api.createForm).not.toHaveBeenCalled();
  });

  it.each([false, true])('seleciona respondente e mostra feedback de envio; parcial=%s', async (partial) => {
    api.publishForm.mockResolvedValue({ notificationSummary: { sent: 1, failed: partial ? 1 : 0 } });
    await prepareSend();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    expect(await screen.findByText(partial ? 'FormulÃ¡rio salvo. 1 convites enviados e 1 falharam.' : 'FormulÃ¡rio salvo e enviado para 1 respondente(s).')).toBeTruthy();
    expect(api.publishForm).toHaveBeenCalledWith('form-1', ['org-1'], ['resident-1']);
    expect(api.publishForm).toHaveBeenCalledOnce();
    expect(api.saveFormAudience).toHaveBeenCalledWith('form-1', ['org-1'], ['resident-1']);
  });

  it('bloqueia duplo clique enquanto persiste', async () => {
    let complete;
    api.createForm.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await prepareSend();
    const button = screen.getByRole('button', { name: 'Salvar e enviar' });
    fireEvent.click(button); fireEvent.click(button);
    expect(api.createForm).toHaveBeenCalledOnce();
    complete({ id: 'form-1' });
    await screen.findByText('FormulÃ¡rio salvo e enviado para 1 respondente(s).');
    expect(api.publishForm).toHaveBeenCalledOnce();
  });

  it('preserva o formulÃ¡rio criado ao repetir apÃ³s uma falha de publicaÃ§Ã£o', async () => {
    api.publishForm.mockRejectedValueOnce(new Error('Falha temporÃ¡ria'));
    await prepareSend();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await screen.findByText('Falha temporÃ¡ria');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await screen.findByText('FormulÃ¡rio salvo e enviado para 1 respondente(s).');
    expect(api.createForm).toHaveBeenCalledOnce();
    expect(api.updateForm).toHaveBeenCalledOnce();
    expect(api.addFormQuestion).toHaveBeenCalledOnce();
    expect(api.updateFormQuestion).toHaveBeenCalledOnce();
  });

  it('permite desmarcar o respondente e salvar sem enviar', async () => {
    await prepareSend();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ }).checked).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    await screen.findByText('FormulÃ¡rio salvo com sucesso.');
    expect(api.saveFormAudience).toHaveBeenCalledWith('form-1', ['org-1'], []);
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it('destaca a pergunta curta sem marcar as demais perguntas', async () => {
    await open();
    fireEvent.change(screen.getByPlaceholderText('Texto da pergunta'), { target: { value: 'AB' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar pergunta/ }));
    const fields = screen.getAllByPlaceholderText('Texto da pergunta');
    fireEvent.change(fields[1], { target: { value: 'Pergunta vÃ¡lida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    expect(screen.getByRole('alert').textContent).toContain('Toda pergunta preenchida');
    expect(fields.map((field) => field.getAttribute('aria-invalid'))).toEqual(['true', 'false']);
    expect(api.createForm).not.toHaveBeenCalled();
  });

  it('exige uma pergunta para enviar, mas permite salvar somente o tÃ­tulo', async () => {
    await prepareSend();
    fireEvent.change(screen.getByPlaceholderText('Texto da pergunta'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    expect(api.createForm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    await screen.findByText('FormulÃ¡rio salvo com sucesso.');
    expect(api.addFormQuestion).not.toHaveBeenCalled();
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it.each(['InÃ­cio', 'Fim', 'ambas'])('exige somente as datas ausentes para enviar: %s', async (missing) => {
    await prepareSend();
    for (const label of missing === 'ambas' ? ['InÃ­cio', 'Fim'] : [missing]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.createForm).not.toHaveBeenCalled();
  });

  it('bloqueia salvar datas invertidas antes de chamar a API', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('InÃ­cio'), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    expect(screen.getByRole('alert').textContent).toBe('A data final deve ser igual ou posterior Ã  data inicial.');
    expect(screen.getByLabelText('Fim').getAttribute('aria-invalid')).toBe('true');
    expect(api.createForm).not.toHaveBeenCalled();
  });

  const chooseOptions = () => {
    const question = screen.getByPlaceholderText('Texto da pergunta').closest('article');
    fireEvent.change(within(question).getByRole('combobox'), { target: { value: 'OPTION' } });
    return screen.getByPlaceholderText('OpÃ§Ãµes separadas por vÃ­rgula');
  };

  it('destaca opÃ§Ãµes vazias sem invalidar uma pergunta livre', async () => {
    await prepareSend();
    const options = chooseOptions();
    fireEvent.change(options, { target: { value: ', , ' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar pergunta/ }));
    fireEvent.change(screen.getAllByPlaceholderText('Texto da pergunta')[1], { target: { value: 'Pergunta livre' } });
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    expect(screen.getByRole('alert').textContent).toContain('Informe ao menos uma opÃ§Ã£o');
    expect(options.getAttribute('aria-invalid')).toBe('true');
    expect(api.createForm).not.toHaveBeenCalled();
  });

  it('retoma apenas as opÃ§Ãµes pendentes apÃ³s falha, sem duplicar formulÃ¡rio, pergunta ou primeira opÃ§Ã£o', async () => {
    api.addQuestionOption.mockResolvedValueOnce({ id: 'option-1' }).mockRejectedValueOnce(new Error('Falha nas opÃ§Ãµes'));
    await prepareSend();
    fireEvent.change(chooseOptions(), { target: { value: ' Sim, NÃ£o, ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await screen.findByText('Falha nas opÃ§Ãµes');
    expect(api.publishForm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await screen.findByText('FormulÃ¡rio salvo e enviado para 1 respondente(s).');
    expect(api.createForm).toHaveBeenCalledOnce();
    expect(api.addFormQuestion).toHaveBeenCalledOnce();
    expect(api.addQuestionOption.mock.calls.map((call) => call[2])).toEqual(['Sim', 'NÃ£o', 'NÃ£o']);
    expect(api.updateFormQuestion).toHaveBeenCalledOnce();
    expect(api.publishForm).toHaveBeenCalledOnce();
  });

  it.each(['Centro', 'Ano', 'MÃªs'])('bloqueia o envio enquanto falta a referÃªncia de indicador: %s', async (missing) => {
    api.getInnovationCenters.mockResolvedValue(missing === 'Centro' ? [] : [{ id: 'center-1', code: 'CI_JOINVILLE', name: 'Joinville' }]);
    api.getFormIndicatorDefinitions.mockResolvedValue([{ id: 'indicator-1', name: 'Empregos', value_type: 'INTEGER', category: 'Pessoas', unit: 'UNIDADE', aggregation_type: 'SUM' }]);
    await prepareSend();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Empregos/ }));
    fireEvent.change(screen.getByLabelText('MÃªs'), { target: { value: missing === 'MÃªs' ? '' : '10' } });
    if (missing === 'Centro') fireEvent.change(screen.getByLabelText('Centro'), { target: { value: '' } });
    if (missing === 'Ano') fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.createForm).not.toHaveBeenCalled();
  });

  it.each(['INELIGIBLE_RESIDENT_RECIPIENT', 'RESPONDENT_ORGANIZATION_REQUIRED', 'RESIDENT_RECIPIENT_REQUIRED'])('mostra erro de elegibilidade no seletor de respondentes: %s', async (code) => {
    api.publishForm.mockRejectedValueOnce({ code, message: 'Respondente indisponÃ­vel. Atualize a seleÃ§Ã£o.' });
    await prepareSend();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    const alert = await screen.findByRole('alert');
    expect(alert.closest('fieldset').querySelector('legend').textContent).toBe('RESPONDENTES');
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('orienta o usuÃ¡rio apÃ³s erro interno e permite tentar novamente sem recriar o formulÃ¡rio', async () => {
    api.saveFormAudience.mockRejectedValueOnce(new Error('Erro interno do servidor'));
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    await screen.findByText('NÃ£o foi possÃ­vel concluir a operaÃ§Ã£o. Verifique os dados e tente novamente.');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    await screen.findByText('FormulÃ¡rio salvo com sucesso.');
    expect(api.createForm).toHaveBeenCalledOnce();
    expect(api.updateForm).toHaveBeenCalledOnce();
  });

  it('bloqueia cliques consecutivos antes da atualizaÃ§Ã£o visual do botÃ£o', async () => {
    let complete;
    api.createForm.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await prepareSend();
    const button = screen.getByRole('button', { name: 'Salvar e enviar' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(api.createForm).toHaveBeenCalledOnce();
    complete({ id: 'form-1' });
    await screen.findByText('FormulÃ¡rio salvo e enviado para 1 respondente(s).');
    expect(api.publishForm).toHaveBeenCalledOnce();
  });

  it('cancela a ediÃ§Ã£o sem salvar ou enviar', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(window.location.pathname).toBe('/forms'));
    expect(api.createForm).not.toHaveBeenCalled();
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it('comeÃ§a com envio desmarcado e desabilitado, com explicaÃ§Ã£o acessÃ­vel e sem alerta global', async () => {
    await open();
    const checkbox = screen.getByRole('checkbox', { name: 'Enviar formulÃ¡rio por e-mail aos respondentes selecionados' });
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.type).toBe('checkbox');
    const descriptions = checkbox.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id).textContent).join(' ');
    expect(descriptions).toContain('0 respondente(s) selecionado(s)');
    expect(descriptions).toContain('Os respondentes receberÃ£o um e-mail com link direto para acessar e responder o formulÃ¡rio.');
    expect(descriptions).toContain('Selecione ao menos um respondente para habilitar o envio por e-mail.');
    expect(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }).classList.contains('primary')).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('habilita a opÃ§Ã£o com respondente sem assumir intenÃ§Ã£o de enviar e salva apenas o rascunho', async () => {
    await prepareSend(false, false);
    const checkbox = screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ });
    expect(checkbox.disabled).toBe(false);
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText('1 respondente(s) selecionado(s)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    await screen.findByText('FormulÃ¡rio salvo com sucesso.');
    expect(api.saveFormAudience).toHaveBeenCalledWith('form-1', ['org-1'], ['resident-1']);
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it('permite marcar pelo teclado, preserva a intenÃ§Ã£o ao editar e desmarcar cancela o envio', async () => {
    const user = userEvent.setup();
    await prepareSend(false, false);
    const checkbox = screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ });
    checkbox.focus();
    await user.keyboard(' ');
    expect(document.activeElement).toBe(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }).classList.contains('secondary')).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('DescriÃ§Ã£o'), { target: { value: 'DescriÃ§Ã£o atualizada' } });
    fireEvent.change(screen.getByPlaceholderText('Texto da pergunta'), { target: { value: 'Pergunta atualizada' } });
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }).classList.contains('primary')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulÃ¡rio' }));
    await screen.findByText('FormulÃ¡rio salvo com sucesso.');
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it('atualiza o contador e sÃ³ cancela a intenÃ§Ã£o de envio quando remove o Ãºltimo respondente', async () => {
    api.getOrganizations.mockResolvedValue([{ id: 'org-1', name: 'Empresa A', status: 'ACTIVE' }]);
    api.getEligibleFormRecipients.mockResolvedValue([
      { id: 'resident-1', name: 'Ana', email: 'ana@example.com', organizations: [{ id: 'org-1', name: 'Empresa A' }] },
      { id: 'resident-2', name: 'Bia', email: 'bia@example.com', organizations: [{ id: 'org-1', name: 'Empresa A' }] },
    ]);
    await open();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Empresa A/ }));
    await screen.findByText('2 respondente(s) disponÃ­vel(is)');
    if (screen.getByRole('button', { name: 'Selecionar respondentes' }).getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(screen.getByRole('button', { name: 'Selecionar respondentes' }));
    }
    fireEvent.click(await screen.findByRole('checkbox', { name: /Ana/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Bia/ }));
    const email = screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ });
    fireEvent.click(email);
    expect(screen.getByText('2 respondente(s) selecionado(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    expect(email.checked).toBe(true);
    expect(screen.getByText('1 respondente(s) selecionado(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Bia/ }));
    expect(email.checked).toBe(false);
    expect(email.disabled).toBe(true);
    expect(screen.getByText('0 respondente(s) selecionado(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    expect(email.disabled).toBe(false);
    expect(email.checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
  });

  it('limpa a intenÃ§Ã£o de envio se a mudanÃ§a de organizaÃ§Ã£o remover os respondentes', async () => {
    api.getOrganizations.mockResolvedValue([{ id: 'org-1', name: 'Empresa A', status: 'ACTIVE' }, { id: 'org-2', name: 'Empresa B', status: 'ACTIVE' }]);
    api.getEligibleFormRecipients.mockImplementation(async (organizationIds) => organizationIds.includes('org-1')
      ? [{ id: 'resident-1', name: 'Ana', email: 'ana@example.com', organizations: [{ id: 'org-1', name: 'Empresa A' }] }] : []);
    await open();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Empresa A/ }));
    await screen.findByText('1 respondente(s) disponÃ­vel(is)');
    if (screen.getByRole('button', { name: 'Selecionar respondentes' }).getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(screen.getByRole('button', { name: 'Selecionar respondentes' }));
    }
    fireEvent.click(await screen.findByRole('checkbox', { name: /Ana/ }));
    const email = screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ });
    fireEvent.click(email);
    fireEvent.click(screen.getByRole('checkbox', { name: /^Empresa B/ }));
    await screen.findByText('1 respondente(s) disponÃ­vel(is)');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Empresa A/ }));
    expect(email.checked).toBe(false);
    expect(email.disabled).toBe(true);
    expect(screen.getByText('0 respondente(s) selecionado(s)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
  });

  it('restaura os respondentes de um rascunho sem marcar automaticamente o envio', async () => {
    api.getFormOrganizations.mockResolvedValue([{ id: 'org-1' }]);
    api.getFormRespondents.mockResolvedValue([{ user_id: 'resident-1', organization_id: 'org-1', status: 'PENDING' }]);
    api.getEligibleFormRecipients.mockResolvedValue([{ id: 'resident-1', name: 'Ana', email: 'ana@example.com', organizations: [{ id: 'org-1', name: 'Empresa A' }] }]);
    await open(true);
    await screen.findByText('1 respondente(s) disponÃ­vel(is)');
    if (screen.getByRole('button', { name: 'Selecionar respondentes' }).getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(screen.getByRole('button', { name: 'Selecionar respondentes' }));
    }
    await screen.findByRole('checkbox', { name: /Ana/ });
    expect(screen.getByRole('checkbox', { name: /Ana/ }).checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ }).checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvar alteraÃ§Ãµes' }).disabled).toBe(false);
  });

  it('bloqueia alteraÃ§Ã£o e envio de formulÃ¡rio jÃ¡ publicado e mantÃ©m reenvio como aÃ§Ã£o separada', async () => {
    api.getForm.mockResolvedValue({ id: 'form-1', title: 'Coleta existente', status: 'ACTIVE' });
    api.getFormRespondents.mockResolvedValue([{ user_id: 'resident-1', organization_id: 'org-1', status: 'SENT' }]);
    await open(true);
    expect(screen.getByRole('checkbox', { name: /Enviar formulÃ¡rio por e-mail/ }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvar e enviar' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Salvar alteraÃ§Ãµes' }).disabled).toBe(true);
    expect(screen.getByPlaceholderText('TÃ­tulo do formulÃ¡rio').disabled).toBe(true);
    expect(screen.getByText(/Convites jÃ¡ enviados nÃ£o serÃ£o reenviados/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    expect(api.publishForm).not.toHaveBeenCalled();
    expect(api.updateForm).not.toHaveBeenCalled();
  });
});

