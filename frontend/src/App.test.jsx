import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  vi.clearAllMocks();
  api.getForms.mockResolvedValue([]);
  api.getForm.mockResolvedValue({ id: 'form-1', title: 'Coleta existente', status: 'DRAFT' });
  api.getFormQuestions.mockResolvedValue([]);
  api.getFormOrganizations.mockResolvedValue([]);
  api.getFormRespondents.mockResolvedValue([]);
  api.updateForm.mockResolvedValue({ id: 'form-1' });
  api.publishForm.mockResolvedValue({ notificationSummary: { sent: 1, failed: 0 } });
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
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));
    await waitFor(() => expect(api.createForm).toHaveBeenCalledOnce());
    expect(api.addFormQuestion).not.toHaveBeenCalled();
    expect(await screen.findByText('Formulário salvo com sucesso.')).toBeTruthy();
    expect(api.publishForm).not.toHaveBeenCalled();
  });

});


describe('salvamento e envio de formulários', () => {
  const open = async (existing = false) => {
    window.history.replaceState({}, '', existing ? '/forms/form-1/edit' : '/forms/new');
    render(<App />);
    if (existing) await screen.findByDisplayValue('Coleta existente');
    else fireEvent.change(screen.getByPlaceholderText('Título do formulário'), { target: { value: 'Nova coleta' } });
  };
  const prepareSend = async (existing = false) => {
    api.getOrganizations.mockResolvedValue([{ id: 'org-1', name: 'Empresa A', status: 'ACTIVE' }]);
    api.getEligibleFormRecipients.mockResolvedValue([{ id: 'resident-1', name: 'Ana', email: 'ana@example.com', organizations: [{ id: 'org-1', name: 'Empresa A' }] }]);
    if (existing) api.getFormQuestions.mockResolvedValue([{ id: 'question-1', label: 'Sua resposta', type: 'TEXT', required: true }]);
    await open(existing);
    fireEvent.change(screen.getByPlaceholderText('Texto da pergunta'), { target: { value: 'Sua resposta' } });
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-12-31' } });
    fireEvent.click(await screen.findByRole('checkbox', { name: /Ana/ }));
  };

  it('edita sem respondente e restaura organizações sem residentes', async () => {
    api.getOrganizations.mockResolvedValue([{ id: 'org-1', name: 'Empresa A', status: 'ACTIVE' }]);
    api.getFormOrganizations.mockResolvedValue([{ id: 'org-1' }]);
    await open(true);
    expect(screen.getByRole('checkbox', { name: /Empresa A/ }).checked).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Nenhum residente elegível para as organizações selecionadas.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Formulário salvo com sucesso.')).toBeTruthy();
    expect(api.updateForm).toHaveBeenCalledOnce();
    expect(api.saveFormAudience).toHaveBeenCalledWith('form-1', ['org-1'], []);
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it.each([false, true])('só exige respondente ao tentar enviar; existente=%s', async (existing) => {
    await open(existing);
    expect(screen.queryByText('Selecione ao menos um respondente para enviar o formulário.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: existing ? 'Salvar e enviar' : 'Criar e enviar' }));
    expect(screen.getByRole('alert').textContent).toBe('Selecione ao menos um respondente para enviar o formulário.');
    expect(api.publishForm).not.toHaveBeenCalled();
    expect(api.createForm).not.toHaveBeenCalled();
    expect(api.updateForm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: existing ? 'Salvar alterações' : 'Salvar formulário' }));
    expect(await screen.findByText('Formulário salvo com sucesso.')).toBeTruthy();
  });

  it('salvar com residentes selecionados não envia convites', async () => {
    await prepareSend();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));
    expect(await screen.findByText('Formulário salvo com sucesso.')).toBeTruthy();
    expect(api.saveFormAudience).toHaveBeenCalledWith('form-1', [], ['resident-1']);
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it('salva e envia um formulário existente', async () => {
    await prepareSend(true);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }));
    await screen.findByText('Formulário salvo e enviado para 1 respondente(s).');
    expect(api.createForm).not.toHaveBeenCalled();
    expect(api.updateForm).toHaveBeenCalledOnce();
    expect(api.publishForm).toHaveBeenCalledWith('form-1', [], ['resident-1']);
  });

  it('destaca somente o campo de título inválido ao salvar', async () => {
    await open();
    fireEvent.change(screen.getByPlaceholderText('Título do formulário'), { target: { value: 'AB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));
    expect(screen.getByPlaceholderText('Título do formulário').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Início').getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText('Selecione ao menos um respondente para enviar o formulário.')).toBeNull();
    expect(api.createForm).not.toHaveBeenCalled();
  });

  it.each([false, true])('seleciona respondente e mostra feedback de envio; parcial=%s', async (partial) => {
    api.publishForm.mockResolvedValue({ notificationSummary: { sent: 1, failed: partial ? 1 : 0 } });
    await prepareSend();
    fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar' }));
    expect(await screen.findByText(partial ? 'Formulário salvo. 1 convites enviados e 1 falharam.' : 'Formulário salvo e enviado para 1 respondente(s).')).toBeTruthy();
    expect(api.publishForm).toHaveBeenCalledWith('form-1', [], ['resident-1']);
    expect(api.publishForm).toHaveBeenCalledOnce();
    expect(api.saveFormAudience).not.toHaveBeenCalled();
  });

  it('bloqueia duplo clique enquanto persiste', async () => {
    let complete;
    api.createForm.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await prepareSend();
    const button = screen.getByRole('button', { name: 'Criar e enviar' });
    fireEvent.click(button); fireEvent.click(button);
    expect(api.createForm).toHaveBeenCalledOnce();
    complete({ id: 'form-1' });
    await screen.findByText('Formulário salvo e enviado para 1 respondente(s).');
    expect(api.publishForm).toHaveBeenCalledOnce();
  });

  it('preserva o formulário criado ao repetir após uma falha de publicação', async () => {
    api.publishForm.mockRejectedValueOnce(new Error('Falha temporária'));
    await prepareSend();
    fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar' }));
    await screen.findByText('Falha temporária');
    fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar' }));
    await screen.findByText('Formulário salvo e enviado para 1 respondente(s).');
    expect(api.createForm).toHaveBeenCalledOnce();
    expect(api.updateForm).toHaveBeenCalledOnce();
    expect(api.addFormQuestion).toHaveBeenCalledOnce();
    expect(api.updateFormQuestion).toHaveBeenCalledOnce();
  });

  it('permite desmarcar o respondente e salvar sem enviar', async () => {
    await prepareSend();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar' }));
    expect(screen.getByRole('alert').textContent).toContain('Selecione ao menos um respondente');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));
    await screen.findByText('Formulário salvo com sucesso.');
    expect(api.saveFormAudience).toHaveBeenCalledWith('form-1', [], []);
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it('destaca a pergunta curta sem marcar as demais perguntas', async () => {
    await open();
    fireEvent.change(screen.getByPlaceholderText('Texto da pergunta'), { target: { value: 'AB' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar pergunta/ }));
    const fields = screen.getAllByPlaceholderText('Texto da pergunta');
    fireEvent.change(fields[1], { target: { value: 'Pergunta válida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));
    expect(screen.getByRole('alert').textContent).toContain('Toda pergunta preenchida');
    expect(fields.map((field) => field.getAttribute('aria-invalid'))).toEqual(['true', 'false']);
    expect(api.createForm).not.toHaveBeenCalled();
  });

  it('exige uma pergunta para enviar, mas permite salvar somente o título', async () => {
    await prepareSend();
    fireEvent.change(screen.getByPlaceholderText('Texto da pergunta'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar' }));
    expect(screen.getByRole('alert').textContent).toBe('Inclua ao menos uma pergunta antes de enviar.');
    expect(api.createForm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));
    await screen.findByText('Formulário salvo com sucesso.');
    expect(api.addFormQuestion).not.toHaveBeenCalled();
    expect(api.publishForm).not.toHaveBeenCalled();
  });

  it.each(['Início', 'Fim', 'ambas'])('exige somente as datas ausentes para enviar: %s', async (missing) => {
    await prepareSend();
    for (const label of missing === 'ambas' ? ['Início', 'Fim'] : [missing]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar' }));
    expect(screen.getByRole('alert').textContent).toBe('Defina as datas de início e fim antes de enviar.');
    for (const label of ['Início', 'Fim']) {
      expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe(String(missing === label || missing === 'ambas'));
    }
    expect(api.createForm).not.toHaveBeenCalled();
  });

  it('bloqueia salvar datas invertidas antes de chamar a API', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));
    expect(screen.getByRole('alert').textContent).toBe('A data final deve ser igual ou posterior à data inicial.');
    expect(screen.getByLabelText('Fim').getAttribute('aria-invalid')).toBe('true');
    expect(api.createForm).not.toHaveBeenCalled();
  });

  const chooseOptions = () => {
    const question = screen.getByPlaceholderText('Texto da pergunta').closest('article');
    fireEvent.change(within(question).getByRole('combobox'), { target: { value: 'OPTION' } });
    return screen.getByPlaceholderText('Opções separadas por vírgula');
  };

  it('destaca opções vazias sem invalidar uma pergunta livre', async () => {
    await prepareSend();
    const options = chooseOptions();
    fireEvent.change(options, { target: { value: ', , ' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar pergunta/ }));
    fireEvent.change(screen.getAllByPlaceholderText('Texto da pergunta')[1], { target: { value: 'Pergunta livre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar' }));
    expect(screen.getByRole('alert').textContent).toContain('Informe ao menos uma opção');
    expect(options.getAttribute('aria-invalid')).toBe('true');
    expect(api.createForm).not.toHaveBeenCalled();
  });

  it('retoma apenas as opções pendentes após falha, sem duplicar formulário, pergunta ou primeira opção', async () => {
    api.addQuestionOption.mockResolvedValueOnce({ id: 'option-1' }).mockRejectedValueOnce(new Error('Falha nas opções'));
    await prepareSend();
    fireEvent.change(chooseOptions(), { target: { value: ' Sim, Não, ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar' }));
    await screen.findByText('Falha nas opções');
    expect(api.publishForm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar' }));
    await screen.findByText('Formulário salvo e enviado para 1 respondente(s).');
    expect(api.createForm).toHaveBeenCalledOnce();
    expect(api.addFormQuestion).toHaveBeenCalledOnce();
    expect(api.addQuestionOption.mock.calls.map((call) => call[2])).toEqual(['Sim', 'Não', 'Não']);
    expect(api.updateFormQuestion).toHaveBeenCalledOnce();
    expect(api.publishForm).toHaveBeenCalledOnce();
  });

  it.each(['Centro', 'Ano', 'Mês'])('destaca a referência ausente de um indicador antes de enviar: %s', async (missing) => {
    api.getInnovationCenters.mockResolvedValue(missing === 'Centro' ? [] : [{ id: 'center-1', code: 'CI_JOINVILLE', name: 'Joinville' }]);
    api.getFormIndicatorDefinitions.mockResolvedValue([{ id: 'indicator-1', name: 'Empregos', value_type: 'INTEGER', category: 'Pessoas', unit: 'UNIDADE', aggregation_type: 'SUM' }]);
    await prepareSend();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Empregos/ }));
    fireEvent.change(screen.getByLabelText('Mês'), { target: { value: missing === 'Mês' ? '' : '10' } });
    if (missing === 'Centro') fireEvent.change(screen.getByLabelText('Centro'), { target: { value: '' } });
    if (missing === 'Ano') fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar' }));
    expect(screen.getByRole('alert').textContent).toContain('Para coletar indicadores');
    expect(screen.getByLabelText(missing).getAttribute('aria-invalid')).toBe('true');
    expect(api.createForm).not.toHaveBeenCalled();
  });

  it.each(['INELIGIBLE_RESIDENT_RECIPIENT', 'RESPONDENT_ORGANIZATION_REQUIRED', 'RESIDENT_RECIPIENT_REQUIRED'])('mostra erro de elegibilidade no seletor de respondentes: %s', async (code) => {
    api.publishForm.mockRejectedValueOnce({ code, message: 'Respondente indisponível. Atualize a seleção.' });
    await prepareSend();
    fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar' }));
    const alert = await screen.findByRole('alert');
    expect(alert.closest('fieldset').querySelector('legend').textContent).toBe('Residentes respondentes');
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('orienta o usuário após erro interno e permite tentar novamente sem recriar o formulário', async () => {
    api.saveFormAudience.mockRejectedValueOnce(new Error('Erro interno do servidor'));
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));
    await screen.findByText('Não foi possível concluir a operação. Verifique os dados e tente novamente.');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar formulário' }));
    await screen.findByText('Formulário salvo com sucesso.');
    expect(api.createForm).toHaveBeenCalledOnce();
    expect(api.updateForm).toHaveBeenCalledOnce();
  });

  it('bloqueia cliques consecutivos antes da atualização visual do botão', async () => {
    let complete;
    api.createForm.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await prepareSend();
    const button = screen.getByRole('button', { name: 'Criar e enviar' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(api.createForm).toHaveBeenCalledOnce();
    complete({ id: 'form-1' });
    await screen.findByText('Formulário salvo e enviado para 1 respondente(s).');
    expect(api.publishForm).toHaveBeenCalledOnce();
  });

  it('cancela a edição sem salvar ou enviar', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(window.location.pathname).toBe('/forms'));
    expect(api.createForm).not.toHaveBeenCalled();
    expect(api.publishForm).not.toHaveBeenCalled();
  });
});
