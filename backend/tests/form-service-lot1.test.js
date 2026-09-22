import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  forms: { findState: vi.fn(), questions: vi.fn(), publish: vi.fn(), recordDelivery: vi.fn(), create: vi.fn(), saveAudience: vi.fn() },
  organizations: { existsActive: vi.fn() }, users: { findEligibleFormRecipients: vi.fn() }, notifications: { createMany: vi.fn() }, audit: vi.fn(), sendFormInvitation: vi.fn(),
}));
vi.mock('../src/repositories/formRepository.js', () => mocks.forms);
vi.mock('../src/repositories/organizationRepository.js', () => mocks.organizations);
vi.mock('../src/repositories/userRepository.js', () => mocks.users);
vi.mock('../src/repositories/notificationRepository.js', () => mocks.notifications);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));
vi.mock('../src/services/emailService.js', () => ({ sendFormInvitation: mocks.sendFormInvitation }));

import { createForm, publishForm, saveAudience } from '../src/services/formService.js';

const formId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const residentId = '44444444-4444-4444-4444-444444444444';
const organizationId = '55555555-5555-5555-5555-555555555555';
const manager = { sub: '11111111-1111-1111-1111-111111111111', role: 'PESQUISADOR' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.forms.findState.mockResolvedValue({ id: formId, title: 'Coleta', status: 'DRAFT', start_date: '2025-01-01', end_date: '2025-12-31' });
  mocks.forms.questions.mockResolvedValue([{ id: 'q1' }]);
  mocks.forms.create.mockResolvedValue({ id: formId, title: 'Coleta' });
  mocks.forms.saveAudience.mockResolvedValue(true);
  mocks.forms.publish.mockResolvedValue({ id: formId, title: 'Coleta', end_date: '2025-12-31' });
  mocks.organizations.existsActive.mockResolvedValue(true);
  mocks.users.findEligibleFormRecipients.mockResolvedValue([{ id: residentId, email: 'ana@example.com', organizations: [{ id: organizationId, name: 'Empresa' }] }]);
  mocks.notifications.createMany.mockResolvedValue([]);
  mocks.sendFormInvitation.mockResolvedValue({ accepted: true });
  mocks.audit.mockResolvedValue();
});

describe('formService lote 1', () => {
  it('cria formulario com periodo de indicadores normalizado e auditoria', async () => {
    const result = await createForm({ title: 'Coleta', innovationCenterId: 'center-1', indicatorYear: '2026', indicatorMonth: '4' }, manager);
    expect(mocks.forms.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: manager.sub, indicatorYear: 2026, indicatorMonth: 4 }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'FORM_CREATED', entityId: formId }));
    expect(result).toEqual({ id: formId, title: 'Coleta' });
  });

  it('rejeita periodo de indicadores parcial ou fora da faixa', async () => {
    await expect(createForm({ title: 'Coleta', innovationCenterId: 'center-1' }, manager)).rejects.toMatchObject({ code: 'INVALID_INDICATOR_PERIOD', status: 422 });
    await expect(createForm({ title: 'Coleta', innovationCenterId: 'center-1', indicatorYear: 1999, indicatorMonth: 13 }, manager)).rejects.toMatchObject({ code: 'INVALID_INDICATOR_PERIOD', status: 422 });
    expect(mocks.forms.create).not.toHaveBeenCalled();
  });

  it('rejeita audiencia com organizacao ou destinatario duplicado', async () => {
    await expect(saveAudience(formId, { organizationIds: [organizationId, organizationId], recipientIds: [] }, manager)).rejects.toMatchObject({ code: 'DUPLICATE_FORM_RECIPIENT', status: 422 });
    await expect(saveAudience(formId, { organizationIds: [], recipientIds: [residentId, residentId] }, manager)).rejects.toMatchObject({ code: 'DUPLICATE_FORM_RECIPIENT', status: 422 });
  });

  it('rejeita audiencia com organizacao inativa ou residente inelegivel', async () => {
    mocks.organizations.existsActive.mockResolvedValue(false);
    await expect(saveAudience(formId, { organizationIds: [organizationId], recipientIds: [] }, manager)).rejects.toMatchObject({ code: 'INVALID_ORGANIZATION', status: 422 });
    mocks.organizations.existsActive.mockResolvedValue(true);
    mocks.users.findEligibleFormRecipients.mockResolvedValue([]);
    await expect(saveAudience(formId, { organizationIds: [organizationId], recipientIds: [residentId] }, manager)).rejects.toMatchObject({ code: 'INELIGIBLE_RESIDENT_RECIPIENT', status: 422 });
  });

  it('rejeita publicacao sem pergunta, periodo ou referencia de indicador', async () => {
    mocks.forms.questions.mockResolvedValue([]);
    await expect(publishForm(formId, { recipientIds: [residentId] }, manager)).rejects.toMatchObject({ code: 'FORM_WITHOUT_QUESTIONS', status: 422 });
    mocks.forms.questions.mockResolvedValue([{ id: 'q1' }]); mocks.forms.findState.mockResolvedValue({ id: formId, status: 'DRAFT' });
    await expect(publishForm(formId, { recipientIds: [residentId] }, manager)).rejects.toMatchObject({ code: 'FORM_PERIOD_REQUIRED', status: 422 });
    mocks.forms.findState.mockResolvedValue({ id: formId, status: 'DRAFT', start_date: '2025-01-01', end_date: '2025-12-31' }); mocks.forms.questions.mockResolvedValue([{ id: 'q1', indicator_id: 'indicator-1' }]);
    await expect(publishForm(formId, { recipientIds: [residentId] }, manager)).rejects.toMatchObject({ code: 'INDICATOR_PERIOD_REQUIRED', status: 422 });
  });

  it('rejeita identificador de residente invalido e conflito de publicacao', async () => {
    await expect(publishForm(formId, { recipientIds: ['not-a-uuid'] }, manager)).rejects.toMatchObject({ code: 'INVALID_RESIDENT_RECIPIENTS', status: 422 });
    mocks.forms.publish.mockResolvedValue(null);
    await expect(publishForm(formId, { recipientIds: [residentId] }, manager)).rejects.toMatchObject({ code: 'FORM_NOT_DRAFT', status: 409 });
  });
});
