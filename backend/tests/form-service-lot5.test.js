import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  forms: {
    findAll: vi.fn(), findById: vi.fn(), indicatorDefinitions: vi.fn(), findState: vi.fn(), saveAudience: vi.fn(), questions: vi.fn(),
    publish: vi.fn(), recordDelivery: vi.fn(), respondents: vi.fn(), targets: vi.fn(), progress: vi.fn(), questionOptions: vi.fn(),
  },
  organizations: { existsActive: vi.fn() }, users: { findEligibleFormRecipients: vi.fn() },
  notifications: { createMany: vi.fn() }, audit: vi.fn(), sendFormInvitation: vi.fn(),
}));
vi.mock('../src/repositories/formRepository.js', () => mocks.forms);
vi.mock('../src/repositories/organizationRepository.js', () => mocks.organizations);
vi.mock('../src/repositories/userRepository.js', () => mocks.users);
vi.mock('../src/repositories/notificationRepository.js', () => mocks.notifications);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));
vi.mock('../src/services/emailService.js', () => ({ sendFormInvitation: mocks.sendFormInvitation }));

import * as service from '../src/services/formService.js';

const manager = { sub: 'admin-1', role: 'PESQUISADOR' };
const formId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const orgId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const recipient = { id: userId, email: 'ana@example.com', organizations: [{ id: orgId, name: 'Empresa' }] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.forms.findById.mockResolvedValue({ id: formId, title: 'Coleta', status: 'ACTIVE', end_date: null });
  mocks.forms.findState.mockResolvedValue({ id: formId, title: 'Coleta', status: 'DRAFT', start_date: '2026-01-01', end_date: '2026-12-31' });
  mocks.users.findEligibleFormRecipients.mockResolvedValue([recipient]);
  mocks.organizations.existsActive.mockResolvedValue(true);
  mocks.audit.mockResolvedValue();
});

describe('formService lote 5', () => {
  it('exercita consultas publicas e exige formulario existente', async () => {
    mocks.forms.findAll.mockResolvedValue([{ id: formId }]);
    mocks.forms.indicatorDefinitions.mockResolvedValue([{ id: 'def-1' }]);
    mocks.forms.respondents.mockResolvedValue([recipient]); mocks.forms.targets.mockResolvedValue([orgId]);
    mocks.forms.questions.mockResolvedValue([{ id: 'q1' }]); mocks.forms.questionOptions.mockResolvedValue([{ value: 'Sim' }]);
    await expect(service.listForms(manager)).resolves.toHaveLength(1);
    await expect(service.listIndicatorDefinitions('')).resolves.toHaveLength(1);
    await expect(service.listRespondents(formId, manager)).resolves.toEqual([recipient]);
    await expect(service.listTargets(formId, manager)).resolves.toEqual([orgId]);
    await expect(service.listQuestions(formId, manager)).resolves.toEqual([{ id: 'q1' }]);
    await expect(service.listQuestionOptions(formId, 'q1', manager)).resolves.toEqual([{ value: 'Sim' }]);
    mocks.forms.findById.mockResolvedValueOnce(null);
    await expect(service.getForm('missing', manager)).rejects.toMatchObject({ code: 'FORM_NOT_FOUND' });
  });

  it('normaliza filtro simples e multiplo de destinatarios elegiveis', async () => {
    await service.listEligibleRecipients({ organizationId: ` ${orgId}, ` });
    expect(mocks.users.findEligibleFormRecipients).toHaveBeenLastCalledWith({ organizationIds: [orgId] });
    await service.listEligibleRecipients({ organizationId: [orgId, ''] });
    expect(mocks.users.findEligibleFormRecipients).toHaveBeenLastCalledWith({ organizationIds: [orgId] });
  });

  it('deriva organizacao do residente ao salvar audiencia e trata conflito', async () => {
    mocks.forms.saveAudience.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(service.saveAudience(formId, { recipientIds: [userId] }, manager)).resolves.toEqual({ organizationIds: [orgId], respondentIds: [userId] });
    expect(mocks.forms.saveAudience).toHaveBeenCalledWith(formId, [orgId], [expect.objectContaining({ organizationId: orgId })]);
    await expect(service.saveAudience(formId, { recipientIds: [userId] }, manager)).rejects.toMatchObject({ code: 'FORM_NOT_DRAFT' });
  });

  it('publica apesar de falha interna e contabiliza email entregue e falho', async () => {
    const secondId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const recipients = [recipient, { id: secondId, email: 'bia@example.com', organizations: [{ id: orgId, name: 'Empresa' }] }];
    mocks.forms.questions.mockResolvedValue([{ id: 'q1' }]);
    mocks.users.findEligibleFormRecipients.mockResolvedValue(recipients);
    mocks.forms.publish.mockResolvedValue({ id: formId, title: 'Coleta', end_date: null });
    mocks.notifications.createMany.mockRejectedValue(new Error('canal indisponivel'));
    mocks.sendFormInvitation.mockResolvedValueOnce().mockRejectedValueOnce(new Error('smtp'));
    mocks.forms.recordDelivery.mockResolvedValue();
    const result = await service.publishForm(formId, { recipientIds: [userId, secondId] }, manager);
    expect(result.notificationSummary).toEqual({ inApp: 0, requested: 2, sent: 1, failed: 1 });
    expect(mocks.forms.recordDelivery).toHaveBeenCalledWith(formId, secondId, expect.objectContaining({ status: 'FAILED', error: 'smtp' }));
  });

  it('calcula progresso com e sem destinatarios e rejeita formulario ausente', async () => {
    mocks.forms.progress.mockResolvedValueOnce({ recipients: 4, submitted: 3 }).mockResolvedValueOnce({ recipients: 0, submitted: 0 }).mockResolvedValueOnce(null);
    await expect(service.getProgress(formId)).resolves.toMatchObject({ percentage: 75 });
    await expect(service.getProgress(formId)).resolves.toMatchObject({ percentage: 0 });
    await expect(service.getProgress(formId)).rejects.toMatchObject({ code: 'FORM_NOT_FOUND' });
  });
});
