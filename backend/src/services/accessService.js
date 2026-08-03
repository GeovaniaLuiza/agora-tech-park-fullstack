import * as access from '../repositories/accessRepository.js';
import * as auditRepository from '../repositories/auditRepository.js';
import { serviceError } from '../utils/validation.js';
import * as emailService from './emailService.js';
import { ROLE_VALUES, ROLES, USER_STATUS } from '../domain/accessControl.js';
import { classifyEmailError } from '../email/smtpProvider.js';

const statuses = [USER_STATUS.ACTIVE, USER_STATUS.INACTIVE];

export const listPending = access.listPending;
export async function listUsers(filters) {
  if (filters.status && !Object.values(USER_STATUS).includes(filters.status)) throw serviceError(422, 'Status inválido', 'INVALID_STATUS');
  if (filters.role && !ROLE_VALUES.includes(filters.role)) throw serviceError(422, 'Perfil inválido', 'INVALID_ROLE');
  return access.listUsers(filters);
}
export const listAudit = (filters) => auditRepository.list(filters);
export async function getRequest(userId) {
  const request = await access.findRequest(userId);
  if (!request || request.status !== USER_STATUS.PENDING || !request.email_verified_at) {
    throw serviceError(404, 'Solicitação não encontrada');
  }
  return request;
}

async function notify(user, type, sender) {
  try { await sender(user); return true; }
  catch (error) {
    const reason = classifyEmailError(error);
    console.error(`[email] Falha de entrega (${type}:${reason})`);
    try {
      await auditRepository.record({ action: 'EMAIL_DELIVERY_FAILED', entityId: user.id || user.userId, details: { type, reason } });
    } catch {
      // A falha da auditoria não deve desfazer uma decisão administrativa já persistida.
    }
    return false;
  }
}

export async function approve(userId, body, admin) {
  const role = body.role;
  if (!ROLE_VALUES.includes(role)) throw serviceError(422, 'Defina um perfil válido antes de aprovar');
  const request = await access.findRequest(userId);
  if (!request || request.status !== USER_STATUS.PENDING) throw serviceError(404, 'Solicitação não encontrada');
  if (!request.email_verified_at) throw serviceError(422, 'O e-mail precisa estar confirmado antes da aprovação');
  if (body.organizationId && !await access.organizationExists(body.organizationId)) {
    throw serviceError(422, 'Organização inválida');
  }
  if (role === ROLES.RESIDENT && !body.organizationId && body.createOrganization !== true) {
    throw serviceError(422, 'Vincule ou crie uma organização para aprovar um residente');
  }
  const result = await access.approve({
    userId,
    adminId: admin.sub,
    role,
    organizationId: body.organizationId,
    organizationName: body.organizationName,
    createOrganization: body.createOrganization === true,
  }, async (client, context) => {
    await auditRepository.record({ userId: admin.sub, action: 'ACCESS_APPROVED', entityId: userId, details: { role } }, client);
    if (context.previousRole !== role) await auditRepository.record({ userId: admin.sub, action: 'ROLE_CHANGED', entityId: userId, details: { from: context.previousRole, to: role } }, client);
    if (context.resolvedOrganizationId) await auditRepository.record({ userId: admin.sub, action: 'ORGANIZATION_LINKED', entityId: userId, details: { organizationId: context.resolvedOrganizationId } }, client);
    await auditRepository.record({ userId: admin.sub, action: 'USER_ACTIVATED', entityId: userId }, client);
  });
  if (!result) throw serviceError(404, 'Solicitação não encontrada');
  return { ...result, notificationSent: await notify(result, 'ACCESS_APPROVED', emailService.sendApproved) };
}

export async function rejectWithReason(userId, body, admin) {
  const reason = body.reason?.trim();
  if (!reason || reason.length < 3 || reason.length > 1000) throw serviceError(422, 'Informe uma justificativa administrativa válida');
  const request = await access.findRequest(userId);
  if (!request || request.status !== USER_STATUS.PENDING || !request.email_verified_at) throw serviceError(404, 'Solicitação não encontrada');
  const user = await access.reject(userId, admin.sub, reason, (client) =>
    auditRepository.record({ userId: admin.sub, action: 'ACCESS_REJECTED', entityId: userId, details: { reasonRecorded: true } }, client));
  if (!user) throw serviceError(404, 'Solicitação não encontrada');
  return { ...user, notificationSent: await notify(user, 'ACCESS_REJECTED', emailService.sendRejected) };
}

export async function changeStatus(userId, status, admin) {
  if (!statuses.includes(status)) throw serviceError(422, 'Status inválido');
  const current = await access.findRequest(userId);
  if (!current) throw serviceError(404, 'Usuário não encontrado');
  if (status === USER_STATUS.ACTIVE) {
    if (!current.email_verified_at || !ROLE_VALUES.includes(current.role)) throw serviceError(422, 'Usuário sem confirmação ou perfil válido');
    if (current.role === ROLES.RESIDENT && !await access.userHasOrganization(userId)) throw serviceError(422, 'Residente sem organização vinculada');
  }
  const user = await access.setStatus(userId, status, admin.sub);
  if (!user) throw serviceError(404, 'Usuário não encontrado');
  await auditRepository.record({ userId: admin.sub, action: status === USER_STATUS.ACTIVE ? 'USER_ACTIVATED' : 'USER_INACTIVATED', entityId: userId });
  if (status === USER_STATUS.INACTIVE) return { ...user, notificationSent: await notify(user, 'USER_INACTIVATED', emailService.sendInactive) };
  return user;
}

export async function changeRole(userId, role, admin) {
  if (!ROLE_VALUES.includes(role)) throw serviceError(422, 'Perfil inválido');
  const current = await access.findRequest(userId);
  if (!current) throw serviceError(404, 'Usuário não encontrado');
  if (role === ROLES.RESIDENT && !await access.userHasOrganization(userId)) throw serviceError(422, 'Residente sem organização vinculada');
  const user = await access.setRole(userId, role);
  await auditRepository.record({ userId: admin.sub, action: 'ROLE_CHANGED', entityId: userId, details: { from: current.role, to: role } });
  return user;
}

export async function linkOrganization(userId, organizationId, admin) {
  if (!organizationId || !await access.organizationExists(organizationId)) throw serviceError(422, 'Organização inválida');
  await access.linkOrganization(userId, organizationId);
  await auditRepository.record({ userId: admin.sub, action: 'ORGANIZATION_LINKED', entityId: userId, details: { organizationId } });
}

export async function unlinkOrganization(userId, organizationId, admin) {
  if (!organizationId || !await access.unlinkOrganization(userId, organizationId)) throw serviceError(404, 'Vínculo não encontrado');
  await auditRepository.record({ userId: admin.sub, action: 'ORGANIZATION_UNLINKED', entityId: userId, details: { organizationId } });
}
