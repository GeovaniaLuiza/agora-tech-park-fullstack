import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import * as access from '../repositories/accessRepository.js';
import * as auditRepository from '../repositories/auditRepository.js';
import * as passwordResetTokens from '../repositories/passwordResetRepository.js';
import { serviceError } from '../utils/validation.js';
import * as emailService from './emailService.js';
import { ROLE_VALUES, ROLES, USER_STATUS } from '../domain/accessControl.js';
import { classifyEmailError } from '../email/smtpProvider.js';
import { logger } from '../observability/logger.js';
import { emailFailures } from '../observability/metrics.js';

const statuses = [USER_STATUS.ACTIVE, USER_STATUS.INACTIVE];
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export const listPending = access.listPending;
export async function listUsers(filters) {
  if (filters.status && !Object.values(USER_STATUS).includes(filters.status)) throw serviceError(422, 'Status inválido', 'INVALID_STATUS');
  if (filters.role && !ROLE_VALUES.includes(filters.role)) throw serviceError(422, 'Perfil inválido', 'INVALID_ROLE');
  return access.listUsers(filters);
}

export async function createUser(body, admin) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || '').toUpperCase();
  const organizationId = body.organizationId || null;
  if (name.length < 3 || name.length > 150 || !NAME_PATTERN.test(name)) throw serviceError(422, 'Informe um nome válido.', 'INVALID_NAME');
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw serviceError(422, 'Informe um e-mail válido.', 'INVALID_EMAIL');
  if (!ROLE_VALUES.includes(role)) throw serviceError(422, 'Selecione um perfil válido.', 'INVALID_ROLE');
  if (organizationId && !await access.organizationExists(organizationId)) throw serviceError(422, 'Organização inválida.', 'INVALID_ORGANIZATION');
  if (role === ROLES.RESIDENT && !organizationId) throw serviceError(422, 'Vincule uma organização ao residente.', 'ORGANIZATION_REQUIRED');
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  let user;
  try {
    user = await access.createManagedUser({ name, email, passwordHash, role, organizationId, adminId: admin.sub },
      (client, created) => auditRepository.record({ userId: admin.sub, action: 'USER_CREATED', entity: 'user', entityId: created.id, details: { role, organizationId } }, client));
  } catch (error) {
    if (error.code === '23505') throw serviceError(409, 'Já existe um usuário com este e-mail.', 'EMAIL_ALREADY_EXISTS');
    throw error;
  }
  let invitationSent = false;
  try {
    const issued = await passwordResetTokens.issue(user.id, null);
    await emailService.sendPasswordReset({ email: user.email, name: user.name, rawToken: issued.rawToken, expiresHours: issued.expiresHours });
    invitationSent = true;
    await auditRepository.record({ userId: admin.sub, action: 'USER_INVITATION_SENT', entity: 'user', entityId: user.id });
  } catch (error) {
    logger.error({ event: 'managed_user_invitation_failed', userId: user.id, err: error }, 'Failed to send managed user invitation');
  }
  return { ...user, organizationId, invitationSent };
}
export const listAudit = (filters) => auditRepository.list(filters);
export const clearAudit = () => auditRepository.clear();
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
    emailFailures.inc({ purpose: type, reason });
    logger.error({ event: 'email_delivery_failed', purpose: type, reason }, 'Email delivery failed');
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

export async function deleteUser(userId, admin) {
  const current = await access.findRequest(userId);
  if (!current) throw serviceError(404, 'Usuário não encontrado');
  if (String(userId) === String(admin.sub)) throw serviceError(422, 'O administrador atual não pode excluir a própria conta');
  if (current.status === USER_STATUS.INACTIVE) {
    await auditRepository.record({ userId: admin.sub, action: 'USER_DELETED', entity: 'user', entityId: userId, details: { logical: true } });
    return;
  }
  await access.setStatus(userId, USER_STATUS.INACTIVE, admin.sub);
  await auditRepository.record({ userId: admin.sub, action: 'USER_DELETED', entity: 'user', entityId: userId, details: { logical: true } });
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
