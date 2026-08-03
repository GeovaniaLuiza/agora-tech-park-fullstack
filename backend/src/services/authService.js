import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as users from '../repositories/userRepository.js';
import * as verificationTokens from '../repositories/emailVerificationRepository.js';
import * as passwordResetTokens from '../repositories/passwordResetRepository.js';
import * as emailService from './emailService.js';
import { record } from '../repositories/auditRepository.js';
import { serviceError } from '../utils/validation.js';
import { ROLE_VALUES, ROLES, USER_STATUS } from '../domain/accessControl.js';
import { classifyEmailError } from '../email/smtpProvider.js';

const genericLoginError = () => serviceError(401, 'E-mail ou senha inválidos.', 'INVALID_CREDENTIALS');
const acceptedResend = Object.freeze({
  message: 'Solicitação processada. Se existir um cadastro pendente para este e-mail, uma nova mensagem de confirmação será enviada.',
  status: 'REQUEST_ACCEPTED',
  nextAction: 'CHECK_EMAIL',
});
const acceptedPasswordReset = Object.freeze({
  message: 'Se existir uma conta elegível para este e-mail, enviaremos instruções para redefinir a senha.',
  status: 'REQUEST_ACCEPTED',
  nextAction: 'CHECK_EMAIL',
});

async function recordDeliveryFailure(userId, type, error) {
  const reason = classifyEmailError(error);
  console.error(`[email] Falha de entrega (${type}:${reason})`);
  await record({ action: 'EMAIL_DELIVERY_FAILED', entityId: userId, details: { type, reason } }).catch(() => {});
}

export async function login({ email, password }, ipAddress) {
  const user = await users.findByEmail(email);
  if (!user || !await bcrypt.compare(password, user.password_hash)) throw genericLoginError();
  if (user.status === USER_STATUS.EMAIL_PENDING || !user.email_verified_at) throw serviceError(403, 'Confirme seu e-mail antes de continuar.', 'EMAIL_NOT_VERIFIED');
  if (user.status === USER_STATUS.PENDING) throw serviceError(403, 'Seu e-mail foi confirmado e sua solicitação está aguardando análise.', 'APPROVAL_PENDING');
  if (user.status !== USER_STATUS.ACTIVE || !ROLE_VALUES.includes(user.role)) {
    throw serviceError(403, 'Esta conta não está disponível para acesso. Entre em contato com o Ágora Tech Park.', 'ACCOUNT_UNAVAILABLE');
  }
  const profile = await users.findPublicProfile(user.id);
  if (user.role === ROLES.RESIDENT && !profile.organizations.length) {
    throw serviceError(403, 'Esta conta não está disponível para acesso. Entre em contato com o Ágora Tech Park.', 'ACCOUNT_UNAVAILABLE');
  }
  await users.recordLogin(user.id, (client) =>
    record({ userId: user.id, action: 'USER_LOGIN', entityId: user.id, ipAddress }, client));
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  return { token, user: profile };
}

export async function registerRequest(data, ipAddress) {
  if (await users.findByEmail(data.email)) {
    throw serviceError(
      409,
      'Não foi criada uma nova solicitação. Se você já iniciou o cadastro, use o reenvio da confirmação ou acompanhe a análise.',
      'EXISTING_ACCESS_REQUEST',
      { requestCreated: false, notificationSent: false, nextAction: 'RESEND_VERIFICATION' },
    );
  }
  const passwordHash = await bcrypt.hash(data.password, 12);
  try {
    const user = await users.createPending({ ...data, passwordHash }, async (client, created) => {
      const issued = await verificationTokens.issue(created.id, client, { requestedIp: ipAddress });
      await record({ action: 'ACCESS_REQUESTED', entityId: created.id, details: { requestedCompanyCnpj: data.cnpj }, ipAddress }, client);
      return issued;
    });
    try {
      await emailService.sendVerification({ email: user.email, name: user.name, rawToken: user.rawToken });
    } catch (error) {
      await verificationTokens.markDeliveryFailed(user.tokenId).catch(() => {});
      await recordDeliveryFailure(user.id, 'VERIFICATION', error);
      throw serviceError(
        503,
        'Solicitação criada, mas não foi possível enviar o e-mail. Não envie um novo cadastro; solicite o reenvio da confirmação.',
        'EMAIL_DELIVERY_FAILED',
        { requestCreated: true, notificationSent: false, nextAction: 'RESEND_VERIFICATION' },
      );
    }
    await verificationTokens.markDelivered(user.tokenId);
    await record({ action: 'EMAIL_VERIFICATION_SENT', entityId: user.id });
    return { id: user.id, status: user.status };
  } catch (error) {
    if (error.code === '23505') {
      throw serviceError(
        409,
        'Não foi criada uma nova solicitação. Se você já iniciou o cadastro, use o reenvio da confirmação ou acompanhe a análise.',
        'EXISTING_ACCESS_REQUEST',
        { requestCreated: false, notificationSent: false, nextAction: 'RESEND_VERIFICATION' },
      );
    }
    throw error;
  }
}

export async function verifyEmail(rawToken, ipAddress) {
  if (typeof rawToken !== 'string' || rawToken.length < 32) throw serviceError(400, 'Link de confirmação inválido.', 'INVALID_TOKEN');
  const result = await verificationTokens.verify(rawToken, (client, token) =>
    record({ action: 'EMAIL_VERIFIED', entityId: token.user_id }, client));
  if (result.state !== 'VERIFIED') {
    await record({ action: 'EMAIL_VERIFICATION_FAILED', details: { reason: result.state }, ipAddress }).catch(() => {});
    if (result.state === 'INVALID') throw serviceError(400, 'Link de confirmação inválido.', 'INVALID_TOKEN');
    if (result.state === 'EXPIRED') throw serviceError(410, 'Este link de confirmação expirou.', 'EXPIRED_TOKEN');
    if (result.state === 'USED') throw serviceError(409, 'Este link de confirmação já foi utilizado.', 'USED_TOKEN');
  }
  let notificationSent = true;
  try { await emailService.sendVerified(result.user); }
  catch (error) {
    notificationSent = false;
    await recordDeliveryFailure(result.user.id, 'VERIFIED', error);
  }
  return {
    message: 'E-mail confirmado com sucesso. Sua solicitação de acesso foi encaminhada para análise da equipe do Ágora Tech Park.',
    notificationSent,
  };
}

export async function resendVerification(email, ipAddress) {
  const user = await users.findByEmail(email);
  if (!user || user.status !== USER_STATUS.EMAIL_PENDING || user.email_verified_at) {
    return acceptedResend;
  }
  const issued = await verificationTokens.issueForExistingUser(user.id, { requestedIp: ipAddress });
  if (issued.tooSoon || issued.rateLimited) {
    await record({
      action: 'EMAIL_VERIFICATION_RESEND_THROTTLED',
      entityId: user.id,
      details: { reason: issued.tooSoon ? 'MINIMUM_INTERVAL' : 'HOURLY_LIMIT' },
      ipAddress,
    }).catch(() => {});
    return acceptedResend;
  }
  if (issued.inProgress) {
    await record({
      action: 'EMAIL_VERIFICATION_RESEND_THROTTLED',
      entityId: user.id,
      details: { reason: 'DELIVERY_IN_PROGRESS' },
      ipAddress,
    }).catch(() => {});
    return acceptedResend;
  }
  await record({ action: 'EMAIL_VERIFICATION_RESEND_REQUESTED', entityId: user.id, ipAddress });
  try {
    await emailService.sendVerification({ email: user.email, name: user.name, rawToken: issued.rawToken });
  } catch (error) {
    await verificationTokens.markDeliveryFailed(issued.tokenId).catch(() => {});
    await recordDeliveryFailure(user.id, 'VERIFICATION_RESEND', error);
    throw serviceError(
      503,
      'Não foi possível enviar o e-mail de confirmação neste momento. Tente novamente mais tarde.',
      'EMAIL_DELIVERY_FAILED',
      { notificationSent: false, nextAction: 'RESEND_VERIFICATION' },
    );
  }
  await verificationTokens.markDelivered(issued.tokenId);
  await record({ action: 'EMAIL_VERIFICATION_RESENT', entityId: user.id, ipAddress });
  return acceptedResend;
}

export async function forgotPassword(email, ipAddress) {
  const user = await users.findByEmail(email);
  if (!user || !user.email_verified_at || user.status === USER_STATUS.EMAIL_PENDING || user.status === USER_STATUS.REJECTED || user.status === USER_STATUS.INACTIVE) {
    return acceptedPasswordReset;
  }
  const issued = await passwordResetTokens.issue(user.id, ipAddress);
  try {
    await emailService.sendPasswordReset({ email: user.email, name: user.name, rawToken: issued.rawToken, expiresHours: issued.expiresHours });
    await record({ action: 'PASSWORD_RESET_SENT', entityId: user.id, ipAddress });
  } catch (error) {
    await recordDeliveryFailure(user.id, 'PASSWORD_RESET', error);
  }
  return acceptedPasswordReset;
}

export async function resetPassword(token, password, ipAddress) {
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await passwordResetTokens.consume(token, passwordHash, async (client, resetToken) =>
    record({ action: 'PASSWORD_RESET_COMPLETED', entityId: resetToken.user_id, ipAddress }, client));
  if (result.state === 'INVALID') throw serviceError(400, 'Link de redefinição inválido.', 'INVALID_RESET_TOKEN');
  if (result.state === 'EXPIRED') throw serviceError(410, 'O link de redefinição expirou. Solicite outro.', 'EXPIRED_RESET_TOKEN');
  if (result.state === 'USED') throw serviceError(409, 'Este link de redefinição já foi utilizado.', 'USED_RESET_TOKEN');
  return { message: 'Senha redefinida com sucesso. Faça login para continuar.' };
}

export const me = (userId) => users.findPublicProfile(userId);
export const logout = (userId, ipAddress) =>
  record({ userId, action: 'USER_LOGOUT', entityId: userId, ipAddress });
