import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  forms: { findById: vi.fn(), findState: vi.fn(), update: vi.fn(), setStatus: vi.fn(), duplicate: vi.fn(), respondent: vi.fn(), recordDelivery: vi.fn(), addQuestion: vi.fn(), updateQuestion: vi.fn(), removeQuestion: vi.fn(), addQuestionOption: vi.fn(), findDefinitionById: vi.fn(), indicatorAlreadyLinked: vi.fn() },
  audit: vi.fn(), sendFormInvitation: vi.fn(),
}));
vi.mock('../src/repositories/formRepository.js', () => mocks.forms);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));
vi.mock('../src/services/emailService.js', () => ({ sendFormInvitation: mocks.sendFormInvitation }));

import { archiveForm, closeForm, createQuestion, createQuestionOption, deleteQuestion, duplicateForm, editQuestion, resendInvitation, updateForm } from '../src/services/formService.js';

const formId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const residentId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const manager = { sub: 'cccccccc-cccc-cccc-cccc-cccccccccccc', role: 'PESQUISADOR' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.forms.findState.mockResolvedValue({ id: formId, status: 'DRAFT' });
  mocks.forms.findById.mockResolvedValue({ id: formId, title: 'Coleta', status: 'ACTIVE', end_date: '2026-12-31' });
  mocks.forms.update.mockResolvedValue({ id: formId, title: 'Atualizada' });
  mocks.forms.setStatus.mockResolvedValue({ id: formId, status: 'CLOSED' });
  mocks.forms.duplicate.mockResolvedValue({ id: 'duplicada' });
  mocks.forms.respondent.mockResolvedValue({ id: residentId, email: 'ana@example.com', organization_name: 'Empresa' });
  mocks.forms.recordDelivery.mockResolvedValue();
  mocks.forms.addQuestion.mockResolvedValue({ id: 'question-1' });
  mocks.forms.updateQuestion.mockResolvedValue({ id: 'question-1' });
  mocks.forms.removeQuestion.mockResolvedValue(true);
  mocks.forms.addQuestionOption.mockResolvedValue({ id: 'option-1', value: 'Sim' });
  mocks.forms.findDefinitionById.mockResolvedValue({ id: 'indicator-1', active: true, calculation_type: 'MANUAL', value_type: 'INTEGER', name: 'Empregos' });
  mocks.forms.indicatorAlreadyLinked.mockResolvedValue(false);
  mocks.sendFormInvitation.mockResolvedValue();
  mocks.audit.mockResolvedValue();
});

describe('formService lote 2', () => {
  it('atualiza apenas rascunho, normaliza período e audita', async () => {
    const result = await updateForm(formId, { title: 'Atualizada', innovationCenterId: 'center-1', indicatorYear: '2026', indicatorMonth: '2' }, manager);
    expect(result.title).toBe('Atualizada');
    expect(mocks.forms.update).toHaveBeenCalledWith(formId, expect.objectContaining({ indicatorYear: 2026, indicatorMonth: 2 }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'FORM_UPDATED' }));
  });

  it('rejeita atualização de formulário inexistente ou fora de rascunho', async () => {
    mocks.forms.findState.mockResolvedValueOnce(null);
    await expect(updateForm(formId, { title: 'X' }, manager)).rejects.toMatchObject({ code: 'FORM_NOT_FOUND' });
    mocks.forms.findState.mockResolvedValueOnce({ id: formId, status: 'ACTIVE' });
    await expect(updateForm(formId, { title: 'X' }, manager)).rejects.toMatchObject({ code: 'FORM_NOT_DRAFT' });
  });

  it('fecha coleta ativa e registra auditoria', async () => {
    mocks.forms.findState.mockResolvedValue({ id: formId, status: 'ACTIVE' });
    await expect(closeForm(formId, manager)).resolves.toMatchObject({ status: 'CLOSED' });
    expect(mocks.forms.setStatus).toHaveBeenCalledWith(formId, 'ACTIVE', 'CLOSED');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'FORM_CLOSED' }));
  });

  it('rejeita fechamento inexistente ou de estado inválido', async () => {
    mocks.forms.findState.mockResolvedValueOnce(null);
    await expect(closeForm(formId, manager)).rejects.toMatchObject({ code: 'FORM_NOT_FOUND' });
    mocks.forms.findState.mockResolvedValueOnce({ id: formId, status: 'DRAFT' });
    await expect(closeForm(formId, manager)).rejects.toMatchObject({ code: 'FORM_NOT_ACTIVE' });
  });

  it('arquiva estado permitido e bloqueia formulário já arquivado', async () => {
    mocks.forms.findState.mockResolvedValueOnce({ id: formId, status: 'CLOSED' });
    await archiveForm(formId, manager);
    expect(mocks.forms.setStatus).toHaveBeenCalledWith(formId, 'CLOSED', 'ARCHIVED');
    mocks.forms.findState.mockResolvedValueOnce({ id: formId, status: 'ARCHIVED' });
    await expect(archiveForm(formId, manager)).rejects.toMatchObject({ code: 'FORM_ALREADY_ARCHIVED' });
  });

  it('duplica formulário e reporta fonte ausente', async () => {
    await expect(duplicateForm(formId, manager)).resolves.toEqual({ id: 'duplicada' });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'FORM_DUPLICATED', details: { sourceId: formId } }));
    mocks.forms.duplicate.mockResolvedValueOnce(null);
    await expect(duplicateForm(formId, manager)).rejects.toMatchObject({ code: 'FORM_NOT_FOUND' });
  });

  it('reenvia convite apenas para formulário ativo e destinatário existente', async () => {
    const result = await resendInvitation(formId, residentId, manager);
    expect(result).toMatchObject({ respondentId: residentId, requested: 1, sent: 1, failed: 0 });
    expect(mocks.sendFormInvitation).toHaveBeenCalledWith(expect.objectContaining({ formId, email: 'ana@example.com' }));
    mocks.forms.findById.mockResolvedValueOnce({ id: formId, status: 'DRAFT' });
    await expect(resendInvitation(formId, residentId, manager)).rejects.toMatchObject({ code: 'FORM_NOT_ACTIVE' });
    mocks.forms.respondent.mockResolvedValueOnce(null);
    await expect(resendInvitation(formId, residentId, manager)).rejects.toMatchObject({ code: 'FORM_RESPONDENT_NOT_FOUND' });
  });

  it('cria pergunta vinculada a indicador manual usando tipo compatível', async () => {
    await createQuestion(formId, { indicatorId: 'indicator-1' }, manager);
    expect(mocks.forms.addQuestion).toHaveBeenCalledWith(formId, expect.objectContaining({ label: 'Empregos', type: 'NUMBER' }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'FORM_QUESTION_CREATED' }));
  });

  it('rejeita indicador inativo, calculado ou já vinculado', async () => {
    mocks.forms.findDefinitionById.mockResolvedValueOnce({ active: false });
    await expect(createQuestion(formId, { indicatorId: 'indicator-1' }, manager)).rejects.toMatchObject({ code: 'INVALID_INDICATOR' });
    mocks.forms.findDefinitionById.mockResolvedValueOnce({ active: true, calculation_type: 'AUTOMATIC' });
    await expect(createQuestion(formId, { indicatorId: 'indicator-1' }, manager)).rejects.toMatchObject({ code: 'INVALID_INDICATOR' });
    mocks.forms.indicatorAlreadyLinked.mockResolvedValueOnce(true);
    await expect(createQuestion(formId, { indicatorId: 'indicator-1' }, manager)).rejects.toMatchObject({ code: 'INDICATOR_ALREADY_LINKED' });
  });

  it('edita e remove perguntas, diferenciando pergunta ausente', async () => {
    await expect(editQuestion(formId, 'question-1', { label: 'Nova', type: 'TEXT' }, manager)).resolves.toMatchObject({ id: 'question-1' });
    await expect(deleteQuestion(formId, 'question-1', manager)).resolves.toBeUndefined();
    mocks.forms.updateQuestion.mockResolvedValueOnce(null);
    await expect(editQuestion(formId, 'question-1', { label: 'Nova', type: 'TEXT' }, manager)).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' });
  });

  it('valida opção obrigatória e pergunta compatível', async () => {
    await expect(createQuestionOption(formId, 'question-1', { value: '  ' }, manager)).rejects.toMatchObject({ code: 'OPTION_REQUIRED' });
    mocks.forms.addQuestionOption.mockResolvedValueOnce(null);
    await expect(createQuestionOption(formId, 'question-1', 'Sim', manager)).rejects.toMatchObject({ code: 'INVALID_OPTION_QUESTION' });
    await expect(createQuestionOption(formId, 'question-1', { value: ' Sim ' }, manager)).resolves.toMatchObject({ value: 'Sim' });
  });
});
