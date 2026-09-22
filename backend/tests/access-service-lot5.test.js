import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: {
    listPending: vi.fn(), listUsers: vi.fn(), organizationExists: vi.fn(), createManagedUser: vi.fn(),
    findRequest: vi.fn(), approve: vi.fn(), reject: vi.fn(), userHasOrganization: vi.fn(),
    setStatus: vi.fn(), setRole: vi.fn(), linkOrganization: vi.fn(), unlinkOrganization: vi.fn(),
  },
  audit: { record: vi.fn(), list: vi.fn(), clear: vi.fn() },
  reset: { issue: vi.fn() },
  email: { sendPasswordReset: vi.fn(), sendApproved: vi.fn(), sendRejected: vi.fn(), sendInactive: vi.fn() },
}));

vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hash') } }));
vi.mock('../src/repositories/accessRepository.js', () => mocks.access);
vi.mock('../src/repositories/auditRepository.js', () => mocks.audit);
vi.mock('../src/repositories/passwordResetRepository.js', () => mocks.reset);
vi.mock('../src/services/emailService.js', () => mocks.email);

import * as service from '../src/services/accessService.js';

const admin = { sub: 'admin-1', role: 'ADMIN' };
const pending = { id: 'user-1', name: 'Ana Silva', email: 'ana@example.com', role: 'RESIDENTE', status: 'PENDING', email_verified_at: '2026-01-01' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.organizationExists.mockResolvedValue(true);
  mocks.access.userHasOrganization.mockResolvedValue(true);
  mocks.access.findRequest.mockResolvedValue(pending);
  mocks.audit.record.mockResolvedValue();
  mocks.reset.issue.mockResolvedValue({ rawToken: 'token', expiresHours: 1 });
  Object.values(mocks.email).forEach((mock) => mock.mockResolvedValue());
});

describe('accessService lote 5', () => {
  it.each([
    [{ status: 'UNKNOWN' }, 'INVALID_STATUS'],
    [{ role: 'UNKNOWN' }, 'INVALID_ROLE'],
  ])('rejeita filtros administrativos invalidos %#', async (filters, code) => {
    await expect(service.listUsers(filters)).rejects.toMatchObject({ code, status: 422 });
    expect(mocks.access.listUsers).not.toHaveBeenCalled();
  });

  it('lista usuarios e encaminha filtros validos', async () => {
    mocks.access.listUsers.mockResolvedValue([{ id: 'user-1' }]);
    await expect(service.listUsers({ status: 'ACTIVE', role: 'ADMIN' })).resolves.toEqual([{ id: 'user-1' }]);
    expect(mocks.access.listUsers).toHaveBeenCalledWith({ status: 'ACTIVE', role: 'ADMIN' });
  });

  it.each([
    [{ name: 'A', email: 'ana@example.com', role: 'ADMIN' }, 'INVALID_NAME'],
    [{ name: 'Ana Silva', email: 'invalido', role: 'ADMIN' }, 'INVALID_EMAIL'],
    [{ name: 'Ana Silva', email: 'ana@example.com', role: 'INVALIDO' }, 'INVALID_ROLE'],
    [{ name: 'Ana Silva', email: 'ana@example.com', role: 'RESIDENTE' }, 'ORGANIZATION_REQUIRED'],
  ])('valida criacao administrativa de usuario %#', async (body, code) => {
    await expect(service.createUser(body, admin)).rejects.toMatchObject({ code });
    expect(mocks.access.createManagedUser).not.toHaveBeenCalled();
  });

  it('rejeita organizacao inexistente ao criar usuario', async () => {
    mocks.access.organizationExists.mockResolvedValue(false);
    await expect(service.createUser({ name: 'Ana Silva', email: 'ana@example.com', role: 'RESIDENTE', organizationId: 'org-1' }, admin)).rejects.toMatchObject({ code: 'INVALID_ORGANIZATION' });
  });

  it('converte conflito de email do repository', async () => {
    mocks.access.createManagedUser.mockRejectedValue({ code: '23505' });
    await expect(service.createUser({ name: 'Ana Silva', email: 'ANA@example.com', role: 'ADMIN' }, admin)).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', status: 409 });
  });

  it('cria usuario e informa falha de convite sem desfazer persistencia', async () => {
    mocks.access.createManagedUser.mockImplementation(async (data, audit) => {
      const created = { id: 'user-1', name: data.name, email: data.email };
      await audit({}, created);
      return created;
    });
    mocks.email.sendPasswordReset.mockRejectedValue(new Error('smtp indisponivel'));
    await expect(service.createUser({ name: 'Ana Silva', email: 'ANA@example.com', role: 'ADMIN' }, admin)).resolves.toMatchObject({ email: 'ana@example.com', organizationId: null, invitationSent: false });
    expect(mocks.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_CREATED' }), {});
  });

  it.each([
    [null],
    [{ ...pending, status: 'ACTIVE' }],
    [{ ...pending, email_verified_at: null }],
  ])('oculta solicitacao que nao esta pendente e verificada %#', async (request) => {
    mocks.access.findRequest.mockResolvedValue(request);
    await expect(service.getRequest('user-1')).rejects.toMatchObject({ status: 404 });
  });

  it('aprova acesso, audita mudancas e envia notificacao', async () => {
    mocks.access.approve.mockImplementation(async (_data, audit) => {
      await audit({}, { previousRole: 'GESTOR', resolvedOrganizationId: 'org-1' });
      return { ...pending, role: 'ADMIN', status: 'ACTIVE' };
    });
    const result = await service.approve('user-1', { role: 'ADMIN', organizationId: 'org-1' }, admin);
    expect(result.notificationSent).toBe(true);
    expect(mocks.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ROLE_CHANGED' }), {});
    expect(mocks.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORGANIZATION_LINKED' }), {});
  });

  it.each([
    [{ role: 'INVALIDO' }, 'INVALID_ROLE'],
    [{ role: 'ADMIN' }, undefined],
    [{ role: 'RESIDENTE' }, undefined],
  ])('rejeita aprovacao inconsistente %#', async (body, code) => {
    if (!code) {
      if (body.role === 'ADMIN') mocks.access.findRequest.mockResolvedValue({ ...pending, email_verified_at: null });
    }
    const expected = code ? { status: 422 } : { status: body.role === 'ADMIN' ? 422 : 422 };
    await expect(service.approve('user-1', body, admin)).rejects.toMatchObject(expected);
  });

  it('trata resultado concorrente ausente na aprovacao', async () => {
    mocks.access.approve.mockResolvedValue(null);
    await expect(service.approve('user-1', { role: 'ADMIN' }, admin)).rejects.toMatchObject({ status: 404 });
  });

  it('rejeita justificativa ruim e solicitacao nao verificada', async () => {
    await expect(service.rejectWithReason('user-1', { reason: 'x' }, admin)).rejects.toMatchObject({ status: 422 });
    mocks.access.findRequest.mockResolvedValue({ ...pending, email_verified_at: null });
    await expect(service.rejectWithReason('user-1', { reason: 'Motivo valido' }, admin)).rejects.toMatchObject({ status: 404 });
  });

  it('rejeita acesso e preserva decisao quando email e auditoria de falha falham', async () => {
    mocks.access.reject.mockImplementation(async (_id, _admin, _reason, audit) => { await audit({}); return { ...pending, status: 'REJECTED' }; });
    mocks.email.sendRejected.mockRejectedValue(new Error('timeout'));
    mocks.audit.record.mockResolvedValueOnce().mockRejectedValueOnce(new Error('audit indisponivel'));
    await expect(service.rejectWithReason('user-1', { reason: 'Cadastro inconsistente' }, admin)).resolves.toMatchObject({ status: 'REJECTED', notificationSent: false });
  });

  it('valida reativacao e inativacao, inclusive ultimo administrador', async () => {
    await expect(service.changeStatus('user-1', 'PENDING', admin)).rejects.toMatchObject({ status: 422 });
    mocks.access.findRequest.mockResolvedValueOnce(null);
    await expect(service.changeStatus('user-1', 'ACTIVE', admin)).rejects.toMatchObject({ status: 404 });
    mocks.access.findRequest.mockResolvedValueOnce({ ...pending, email_verified_at: null });
    await expect(service.changeStatus('user-1', 'ACTIVE', admin)).rejects.toMatchObject({ status: 422 });
    mocks.access.findRequest.mockResolvedValueOnce(pending);
    mocks.access.userHasOrganization.mockResolvedValueOnce(false);
    await expect(service.changeStatus('user-1', 'ACTIVE', admin)).rejects.toMatchObject({ status: 422 });
    mocks.access.findRequest.mockResolvedValueOnce({ ...pending, role: 'ADMIN' });
    mocks.access.setStatus.mockRejectedValueOnce({ code: 'LAST_ACTIVE_ADMIN' });
    await expect(service.changeStatus('user-1', 'INACTIVE', admin)).rejects.toMatchObject({ code: 'LAST_ACTIVE_ADMIN', status: 409 });
  });

  it('inativa usuario e sinaliza falha de notificacao', async () => {
    mocks.access.setStatus.mockResolvedValue({ ...pending, status: 'INACTIVE' });
    mocks.email.sendInactive.mockRejectedValue(new Error('smtp'));
    await expect(service.changeStatus('user-1', 'INACTIVE', admin)).resolves.toMatchObject({ notificationSent: false });
  });

  it('valida exclusao logica e alteracao de perfil', async () => {
    mocks.access.findRequest.mockResolvedValueOnce(null);
    await expect(service.deleteUser('user-1', admin)).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteUser(admin.sub, admin)).rejects.toMatchObject({ status: 422 });
    await expect(service.changeRole('user-1', 'INVALIDO', admin)).rejects.toMatchObject({ status: 422 });
    mocks.access.findRequest.mockResolvedValueOnce(null);
    await expect(service.changeRole('user-1', 'ADMIN', admin)).rejects.toMatchObject({ status: 404 });
    mocks.access.userHasOrganization.mockResolvedValueOnce(false);
    await expect(service.changeRole('user-1', 'RESIDENTE', admin)).rejects.toMatchObject({ status: 422 });
  });

  it('altera perfil e detecta mutacao concorrente ausente', async () => {
    mocks.access.setRole.mockResolvedValueOnce({ ...pending, role: 'GESTOR' }).mockResolvedValueOnce(null);
    await expect(service.changeRole('user-1', 'GESTOR', admin)).resolves.toMatchObject({ role: 'GESTOR' });
    await expect(service.changeRole('user-1', 'ADMIN', admin)).rejects.toMatchObject({ status: 404 });
  });

  it('vincula e desvincula organizacao com validacao', async () => {
    mocks.access.organizationExists.mockResolvedValueOnce(false);
    await expect(service.linkOrganization('user-1', 'org-1', admin)).rejects.toMatchObject({ status: 422 });
    await service.linkOrganization('user-1', 'org-1', admin);
    expect(mocks.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORGANIZATION_LINKED' }));
    mocks.access.unlinkOrganization.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(service.unlinkOrganization('user-1', 'org-1', admin)).rejects.toMatchObject({ status: 404 });
    await expect(service.unlinkOrganization('user-1', 'org-1', admin)).resolves.toBeUndefined();
  });
});
