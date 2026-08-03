import * as repository from '../repositories/organizationRepository.js';
import { record } from '../repositories/auditRepository.js';
import { normalizeCnpj, serviceError } from '../utils/validation.js';

function validate(data, partial = false) {
  const name = data.name?.trim();
  if (!partial && (!name || name.length < 2)) throw serviceError(422, 'Informe o nome da organização', 'INVALID_ORGANIZATION');
  if (data.name !== undefined && (!name || name.length < 2)) throw serviceError(422, 'Nome da organização inválido', 'INVALID_ORGANIZATION');
  const cnpj = data.cnpj ? normalizeCnpj(data.cnpj) : null;
  if (cnpj && cnpj.length !== 14) throw serviceError(422, 'CNPJ inválido', 'INVALID_CNPJ');
  if (data.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(data.status)) throw serviceError(422, 'Status inválido', 'INVALID_STATUS');
  return { ...data, name, cnpj };
}

export const list = (user) => user.role === 'RESIDENTE'
  ? repository.findForUser(user.sub)
  : repository.findAll({ includeInactive: user.role === 'ADMIN' });

export async function get(id, user) {
  if (user.role === 'RESIDENTE' && !await repository.userHasOrganization(user.sub, id)) {
    throw serviceError(403, 'Permissão insuficiente', 'FORBIDDEN');
  }
  const organization = await repository.findById(id);
  if (!organization) throw serviceError(404, 'Organização não encontrada', 'ORGANIZATION_NOT_FOUND');
  return organization;
}

export async function create(data, user) {
  try {
    const organization = await repository.create(validate(data));
    await record({ userId: user.sub, action: 'ORGANIZATION_CREATED', entity: 'organization', entityId: organization.id });
    return organization;
  } catch (error) {
    if (error.code === '23505') throw serviceError(409, 'Já existe uma organização com este CNPJ', 'ORGANIZATION_CONFLICT');
    throw error;
  }
}

export async function update(id, data, user) {
  try {
    const organization = await repository.update(id, validate(data, true));
    if (!organization) throw serviceError(404, 'Organização não encontrada', 'ORGANIZATION_NOT_FOUND');
    await record({ userId: user.sub, action: 'ORGANIZATION_UPDATED', entity: 'organization', entityId: id });
    return organization;
  } catch (error) {
    if (error.code === '23505') throw serviceError(409, 'Já existe uma organização com este CNPJ', 'ORGANIZATION_CONFLICT');
    throw error;
  }
}

export async function inactivate(id, user) {
  if (!await repository.inactivate(id)) throw serviceError(404, 'Organização não encontrada ou já inativa', 'ORGANIZATION_NOT_FOUND');
  await record({ userId: user.sub, action: 'ORGANIZATION_INACTIVATED', entity: 'organization', entityId: id });
}
