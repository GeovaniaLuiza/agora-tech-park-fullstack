import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  responses: { submissionContext: vi.fn(), formQuestions: vi.fn(), saveDraft: vi.fn(), submit: vi.fn(), history: vi.fn(), findByFormAndOrganization: vi.fn(), getAnswers: vi.fn(), reopen: vi.fn() },
  users: { hasOrganization: vi.fn() }, audit: vi.fn(), processLinkedAnswers: vi.fn(),
}));
vi.mock('../src/repositories/responseRepository.js', () => mocks.responses);
vi.mock('../src/repositories/userRepository.js', () => mocks.users);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));
vi.mock('../src/services/indicatorValueService.js', () => ({ processLinkedAnswers: mocks.processLinkedAnswers }));

import { get, history, reopen, saveDraft, submit } from '../src/services/responseService.js';

const formId = 'form-1';
const organizationId = 'organization-1';
const resident = { sub: 'resident-1', role: 'RESIDENTE' };
const manager = { sub: 'manager-1', role: 'PESQUISADOR' };
const activeForm = { id: formId, organization_id: organizationId, status: 'ACTIVE', start_date: '2020-01-01', end_date: '2099-12-31', targeted: true, innovation_center_id: 'center-1', indicator_year: 2026, indicator_month: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.users.hasOrganization.mockResolvedValue(true);
  mocks.responses.submissionContext.mockResolvedValue(activeForm);
  mocks.responses.formQuestions.mockResolvedValue([{ id: 'text', label: 'Nome', type: 'TEXT', required: true, options: [] }, { id: 'number', label: 'Pessoas', type: 'NUMBER', required: false, options: [] }, { id: 'option', label: 'Tipo', type: 'OPTION', required: false, options: ['A', 'B'] }]);
  mocks.responses.saveDraft.mockResolvedValue({ id: 'response-1', status: 'DRAFT' });
  mocks.responses.submit.mockResolvedValue({ id: 'response-1', status: 'SUBMITTED', indicatorsUpdated: 1 });
  mocks.responses.history.mockResolvedValue([{ id: 'response-1' }]);
  mocks.responses.findByFormAndOrganization.mockResolvedValue({ id: 'response-1', form_id: formId });
  mocks.responses.getAnswers.mockResolvedValue([{ question_id: 'text', value: 'Ana' }]);
  mocks.responses.reopen.mockResolvedValue({ id: 'response-1', status: 'REOPENED' });
  mocks.audit.mockResolvedValue();
  mocks.processLinkedAnswers.mockResolvedValue(1);
});

describe('responseService lote 2', () => {
  it('rejects reopening by a resident before accessing the repository', async () => {
    await expect(reopen('response-1', resident)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(mocks.responses.reopen).not.toHaveBeenCalled();
  });

  it('reopens a form without indicator competence and still audits inside the transaction', async () => {
    await reopen('response-1', manager);
    await mocks.responses.reopen.mock.calls[0][2]({ organization_id: organizationId, indicator_year: null }, 'transaction-client');
    expect(mocks.processLinkedAnswers).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESPONSE_REOPENED' }), 'transaction-client');
  });

  it('submits a form without indicator competence without publishing indicators', async () => {
    mocks.responses.submissionContext.mockResolvedValueOnce({ ...activeForm, indicator_year: null });
    await submit(formId, { organizationId, answers: [{ questionId: 'text', value: 'Ana' }] }, resident);
    await expect(mocks.responses.submit.mock.calls[0][0].processSubmission('response-1', 'transaction-client')).resolves.toBe(0);
    expect(mocks.processLinkedAnswers).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ indicatorsUpdated: 0 }) }), 'transaction-client');
  });
  it('restringe preenchimento a residentes', async () => {
    await expect(saveDraft(formId, { organizationId, answers: [] }, manager)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.responses.submissionContext).not.toHaveBeenCalled();
  });

  it('exige organização e vínculo do residente', async () => {
    await expect(saveDraft(formId, { answers: [] }, resident)).rejects.toMatchObject({ code: 'ORGANIZATION_REQUIRED' });
    mocks.users.hasOrganization.mockResolvedValueOnce(false);
    await expect(saveDraft(formId, { organizationId, answers: [] }, resident)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('bloqueia formulário inexistente, inativo e fora da janela de coleta', async () => {
    mocks.responses.submissionContext.mockResolvedValueOnce(null);
    await expect(saveDraft(formId, { organizationId, answers: [] }, resident)).rejects.toMatchObject({ code: 'FORM_NOT_FOUND' });
    mocks.responses.submissionContext.mockResolvedValueOnce({ ...activeForm, status: 'CLOSED' });
    await expect(saveDraft(formId, { organizationId, answers: [] }, resident)).rejects.toMatchObject({ code: 'FORM_NOT_ACTIVE' });
    mocks.responses.submissionContext.mockResolvedValueOnce({ ...activeForm, start_date: '2999-01-01' });
    await expect(saveDraft(formId, { organizationId, answers: [] }, resident)).rejects.toMatchObject({ code: 'COLLECTION_NOT_STARTED' });
    mocks.responses.submissionContext.mockResolvedValueOnce({ ...activeForm, end_date: '2000-01-01' });
    await expect(saveDraft(formId, { organizationId, answers: [] }, resident)).rejects.toMatchObject({ code: 'COLLECTION_CLOSED' });
  });

  it('bloqueia organização não destinatária', async () => {
    mocks.responses.submissionContext.mockResolvedValueOnce({ ...activeForm, targeted: false });
    await expect(saveDraft(formId, { organizationId, answers: [] }, resident)).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_TARGETED' });
  });

  it('rejeita respostas ausentes, estranhas, duplicadas ou inválidas', async () => {
    await expect(saveDraft(formId, { organizationId }, resident)).rejects.toMatchObject({ code: 'ANSWERS_REQUIRED' });
    await expect(saveDraft(formId, { organizationId, answers: [{ questionId: 'other', value: 'x' }] }, resident)).rejects.toMatchObject({ code: 'INVALID_ANSWER' });
    await expect(saveDraft(formId, { organizationId, answers: [{ questionId: 'text', value: 'x' }, { questionId: 'text', value: 'y' }] }, resident)).rejects.toMatchObject({ code: 'INVALID_ANSWER' });
    await expect(saveDraft(formId, { organizationId, answers: [{ questionId: 'number', value: '1.5' }] }, resident)).rejects.toMatchObject({ code: 'INVALID_ANSWER' });
  });

  it('valida opção e campos obrigatórios no envio', async () => {
    await expect(submit(formId, { organizationId, answers: [{ questionId: 'option', value: 'C' }] }, resident)).rejects.toMatchObject({ code: 'INVALID_OPTION' });
    await expect(submit(formId, { organizationId, answers: [{ questionId: 'number', value: '2' }] }, resident)).rejects.toMatchObject({ code: 'REQUIRED_ANSWERS_MISSING', details: { fields: ['text'] } });
  });

  it('salva rascunho normalizado e registra auditoria', async () => {
    const result = await saveDraft(formId, { organizationId, answers: [{ questionId: 'text', value: ' Ana ' }, { questionId: 'number', value: '' }] }, resident);
    expect(result.status).toBe('DRAFT');
    expect(mocks.responses.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ answers: [{ questionId: 'text', value: 'Ana', indicator_id: null, questionType: 'TEXT' }] }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESPONSE_DRAFT_SAVED' }));
  });

  it('envia resposta e processa indicadores dentro da transação do repository', async () => {
    await expect(submit(formId, { organizationId, answers: [{ questionId: 'text', value: 'Ana' }] }, resident)).resolves.toMatchObject({ status: 'SUBMITTED', indicatorsUpdated: 1 });
    const data = mocks.responses.submit.mock.calls[0][0];
    await expect(data.processSubmission('response-1', 'transaction-client')).resolves.toBe(1);
    expect(mocks.processLinkedAnswers).toHaveBeenCalledWith(expect.objectContaining({ responseId: 'response-1', centerId: 'center-1', year: 2026, month: 2 }), 'transaction-client');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESPONSE_SUBMITTED', details: expect.objectContaining({ indicatorsUpdated: 1 }) }), 'transaction-client');
  });

  it('reporta conflito quando resposta enviada não foi reaberta', async () => {
    mocks.responses.submit.mockResolvedValueOnce({ conflict: true });
    await expect(submit(formId, { organizationId, answers: [{ questionId: 'text', value: 'Ana' }] }, resident)).rejects.toMatchObject({ code: 'RESPONSE_ALREADY_SUBMITTED' });
  });

  it('scopes resident reads and history to the authenticated identity and keeps staff access explicit', async () => {
    await get(formId, organizationId, resident, 'response-1');
    expect(mocks.responses.findByFormAndOrganization).toHaveBeenCalledWith(formId, organizationId, resident.sub, 'response-1');
    await history(organizationId, resident);
    expect(mocks.responses.history).toHaveBeenCalledWith(organizationId, resident.sub);
    await history(organizationId, manager);
    expect(mocks.responses.history).toHaveBeenCalledWith(organizationId, null);
    mocks.responses.findByFormAndOrganization.mockResolvedValueOnce({ ambiguous: true });
    await expect(get(formId, organizationId, manager)).rejects.toMatchObject({ status: 409, code: 'RESPONSE_SELECTION_REQUIRED' });
  });

  it('does not claim unresolved history when saving or submitting', async () => {
    mocks.responses.submit.mockResolvedValueOnce({ legacyConflict: true });
    await expect(submit(formId, { organizationId, answers: [{ questionId: 'text', value: 'Ana' }] }, resident))
      .rejects.toMatchObject({ status: 409, code: 'LEGACY_RESPONSE_REVIEW_REQUIRED' });
  });

  it('protege histórico e consulta, incluindo resposta inexistente', async () => {
    mocks.users.hasOrganization.mockResolvedValueOnce(false);
    await expect(history(organizationId, resident)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(history(organizationId, manager)).resolves.toEqual([{ id: 'response-1' }]);
    mocks.responses.findByFormAndOrganization.mockResolvedValueOnce(null);
    await expect(get(formId, organizationId, manager)).rejects.toMatchObject({ code: 'RESPONSE_NOT_FOUND' });
    await expect(get(formId, organizationId, manager)).resolves.toMatchObject({ answers: [{ question_id: 'text', value: 'Ana' }] });
  });

  it('reabre apenas resposta enviada e registra auditoria', async () => {
    await expect(reopen('response-1', manager)).resolves.toMatchObject({ status: 'REOPENED' });
    await mocks.responses.reopen.mock.calls[0][2]({ organization_id: organizationId, innovation_center_id: 'center-1', indicator_year: 2026, indicator_month: 2 }, 'transaction-client');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESPONSE_REOPENED' }), 'transaction-client');
    mocks.responses.reopen.mockResolvedValueOnce(null);
    await expect(reopen('response-1', manager)).rejects.toMatchObject({ code: 'RESPONSE_NOT_SUBMITTED' });
  });
});
