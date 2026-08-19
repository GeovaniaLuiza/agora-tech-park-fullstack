import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  forms: { findState: vi.fn(), questions: vi.fn(), publish: vi.fn(), recordDelivery: vi.fn() },
  organizations: { existsActive: vi.fn() },
  users: { findEligibleFormRecipients: vi.fn() },
  notifications: { createMany: vi.fn() },
  audit: vi.fn(),
  sendFormInvitation: vi.fn(),
}));

vi.mock('../src/repositories/formRepository.js', () => mocks.forms);
vi.mock('../src/repositories/organizationRepository.js', () => mocks.organizations);
vi.mock('../src/repositories/userRepository.js', () => mocks.users);
vi.mock('../src/repositories/notificationRepository.js', () => mocks.notifications);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));
vi.mock('../src/services/emailService.js', () => ({ sendFormInvitation: mocks.sendFormInvitation }));

import { publishForm } from '../src/services/formService.js';

const formId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const residentId = '44444444-4444-4444-4444-444444444444';
const organizationId = '55555555-5555-5555-5555-555555555555';
const manager = { sub: '11111111-1111-1111-1111-111111111111', role: 'PESQUISADOR' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.forms.findState.mockResolvedValue({ id: formId, title: 'Coleta', status: 'DRAFT', start_date: '2025-01-01', end_date: '2025-12-31' });
  mocks.forms.questions.mockResolvedValue([{ id: 'q1' }]);
  mocks.organizations.existsActive.mockResolvedValue(true);
  mocks.users.findEligibleFormRecipients.mockResolvedValue([{ id: residentId, name: 'Ana Costa', email: 'ana@agoratechpark.com.br', organizations: [{ id: organizationId, name: 'Marina Tech' }] }]);
  mocks.forms.publish.mockResolvedValue({ id: formId, title: 'Coleta', end_date: '2025-12-31' });
  mocks.forms.recordDelivery.mockResolvedValue({ status: 'SENT' });
  mocks.notifications.createMany.mockResolvedValue([{ id: 'n1' }]);
  mocks.sendFormInvitation.mockResolvedValue({ accepted: true });
  mocks.audit.mockResolvedValue();
});

describe('destinatários de formulários', () => {
  it('rejeita publicação sem um residente selecionado', async () => {
    await expect(publishForm(formId, { organizationIds: [organizationId], recipientEmails: ['externo@test.com'] }, manager))
      .rejects.toMatchObject({ code: 'RESIDENT_RECIPIENT_REQUIRED', status: 422 });
    expect(mocks.forms.publish).not.toHaveBeenCalled();
  });

  it('rejeita usuário que não seja residente ativo e vinculado', async () => {
    mocks.users.findEligibleFormRecipients.mockResolvedValue([]);
    await expect(publishForm(formId, { organizationIds: [organizationId], recipientIds: [residentId] }, manager))
      .rejects.toMatchObject({ code: 'INELIGIBLE_RESIDENT_RECIPIENT', status: 422 });
    expect(mocks.forms.publish).not.toHaveBeenCalled();
  });

  it('publica, notifica e envia somente para residente elegível', async () => {
    const result = await publishForm(formId, { organizationIds: [], recipientIds: [residentId] }, manager);
    expect(mocks.forms.publish).toHaveBeenCalledWith(formId, [organizationId], [expect.objectContaining({ id: residentId, organizationId })]);
    expect(mocks.notifications.createMany).toHaveBeenCalledWith([residentId], expect.any(Object));
    expect(mocks.sendFormInvitation).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@agoratechpark.com.br', formId }));
    expect(result.notificationSummary).toEqual({ inApp: 1, requested: 1, sent: 1, failed: 0 });
  });

});
