import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: { findById: vi.fn(), userHasOrganization: vi.fn(), create: vi.fn(), update: vi.fn(), inactivate: vi.fn() },
  audit: vi.fn(),
}));

vi.mock('../src/repositories/organizationRepository.js', () => mocks.repository);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));

import { create, get, inactivate, update } from '../src/services/organizationService.js';

const admin = { sub: 'admin-1', role: 'ADMIN' };
const resident = { sub: 'resident-1', role: 'RESIDENTE' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repository.findById.mockResolvedValue({ id: 'org-1', name: 'Agoratech', cnpj: '11222333000181' });
  mocks.repository.create.mockResolvedValue({ id: 'org-1', name: 'Agoratech', cnpj: '11222333000181' });
  mocks.repository.update.mockResolvedValue({ id: 'org-1', name: 'Agoratech Atualizado' });
  mocks.repository.inactivate.mockResolvedValue(true);
  mocks.audit.mockResolvedValue();
});

describe('organizationService', () => {
  it('cria organizacao com CNPJ normalizado e registra auditoria', async () => {
    const result = await create({ name: ' Agoratech ', cnpj: '11.222.333/0001-81' }, admin);
    expect(mocks.repository.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Agoratech', cnpj: '11222333000181' }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORGANIZATION_CREATED', userId: admin.sub }));
    expect(result.id).toBe('org-1');
  });

  it.each([
    [{ name: 'A' }, 'INVALID_ORGANIZATION'],
    [{ name: 'Organizacao', cnpj: '123' }, 'INVALID_CNPJ'],
    [{ name: 'Organizacao', status: 'PENDING' }, 'INVALID_STATUS'],
  ])('rejeita dados invalidos (%s)', async (payload, code) => {
    await expect(create(payload, admin)).rejects.toMatchObject({ code, status: 422 });
    expect(mocks.repository.create).not.toHaveBeenCalled();
  });

  it('converte conflito de CNPJ em erro de dominio', async () => {
    mocks.repository.create.mockRejectedValue({ code: '23505' });
    await expect(create({ name: 'Agoratech', cnpj: '11222333000181' }, admin)).rejects.toMatchObject({ code: 'ORGANIZATION_CONFLICT', status: 409 });
  });

  it('impede residente sem vinculo de consultar organizacao', async () => {
    mocks.repository.userHasOrganization.mockResolvedValue(false);
    await expect(get('org-1', resident)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(mocks.repository.findById).not.toHaveBeenCalled();
  });

  it('retorna 404 quando organizacao nao existe', async () => {
    mocks.repository.findById.mockResolvedValue(null);
    await expect(get('missing', admin)).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND', status: 404 });
  });

  it('atualiza organizacao e registra auditoria', async () => {
    const result = await update('org-1', { name: 'Agoratech Atualizado' }, admin);
    expect(result.name).toBe('Agoratech Atualizado');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORGANIZATION_UPDATED', entityId: 'org-1' }));
  });

  it('retorna 404 na atualizacao ou inativacao sem registro elegivel', async () => {
    mocks.repository.update.mockResolvedValue(null);
    await expect(update('missing', { name: 'Outra' }, admin)).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND', status: 404 });
    mocks.repository.inactivate.mockResolvedValue(false);
    await expect(inactivate('missing', admin)).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND', status: 404 });
  });

  it('inativa logicamente organizacao e registra auditoria', async () => {
    await expect(inactivate('org-1', admin)).resolves.toBeUndefined();
    expect(mocks.repository.inactivate).toHaveBeenCalledWith('org-1');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORGANIZATION_INACTIVATED', entityId: 'org-1' }));
  });
});
