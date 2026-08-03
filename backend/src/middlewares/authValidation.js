import { isStrongPassword, isValidCnpj, isValidEmail, normalizeCnpj, normalizeEmail } from '../utils/validation.js';
import { z } from 'zod';

const ADMINISTRATIVE_FIELDS = new Set([
  'role', 'perfil', 'status', 'permissions', 'approvedBy', 'approvedAt',
  'organizationId', 'organizations', 'authorizedOrganizations',
  'emailVerifiedAt', 'email_verified_at', 'rejectedAt', 'inactivatedAt', 'lastLoginAt',
]);

export function validateLogin(req, res, next) {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!isValidEmail(email) || typeof password !== 'string' || !password) {
    return res.status(422).json({ message: 'Informe e-mail e senha válidos' });
  }
  req.body = { email, password };
  next();
}

export function validateRegisterRequest(req, res, next) {
  const { name, password, confirmPassword, companyName, acceptedTerms } = req.body || {};
  const email = normalizeEmail(req.body?.email);
  const cnpj = normalizeCnpj(req.body?.cnpj);
  if (Object.keys(req.body || {}).some((field) => ADMINISTRATIVE_FIELDS.has(field))) {
    return res.status(400).json({ message: 'Solicitação inválida' });
  }
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 150) return res.status(422).json({ message: 'Nome inválido' });
  if (!isValidEmail(email)) return res.status(422).json({ message: 'E-mail inválido' });
  if (!isStrongPassword(password)) return res.status(422).json({ message: 'A senha não atende aos requisitos de segurança' });
  if (password !== confirmPassword) return res.status(422).json({ message: 'As senhas não coincidem' });
  if (!isValidCnpj(cnpj)) return res.status(422).json({ message: 'CNPJ inválido' });
  if (typeof companyName !== 'string' || companyName.trim().length < 2 || companyName.trim().length > 150) return res.status(422).json({ message: 'Nome da empresa inválido' });
  if (acceptedTerms !== true) return res.status(422).json({ message: 'É necessário aceitar os termos' });
  req.body = { name: name.trim(), email, password, cnpj, companyName: companyName.trim() };
  next();
}

export function validateVerification(req, res, next) {
  if (typeof req.body?.token !== 'string' || req.body.token.length < 32) return res.status(422).json({ message: 'Token inválido' });
  req.body = { token: req.body.token };
  next();
}

export function validateResend(req, res, next) {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) {
    return res.status(422).json({
      message: 'Informe um endereço de e-mail válido.',
      code: 'INVALID_EMAIL',
      nextAction: 'CORRECT_EMAIL',
    });
  }
  req.body = { email };
  next();
}

const emailSchema = z.string().trim().email().max(254);
const resetSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string(),
  confirmPassword: z.string(),
});

export function validateForgotPassword(req, res, next) {
  const parsed = emailSchema.safeParse(req.body?.email);
  if (!parsed.success) return res.status(422).json({ message: 'Informe um endereço de e-mail válido.', code: 'INVALID_EMAIL' });
  req.body = { email: normalizeEmail(parsed.data) };
  next();
}

export function validatePasswordReset(req, res, next) {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success || !isStrongPassword(parsed.data.password) || parsed.data.password !== parsed.data.confirmPassword) {
    return res.status(422).json({ message: 'Informe uma senha forte e a confirmação correspondente.', code: 'INVALID_PASSWORD_RESET' });
  }
  req.body = { token: parsed.data.token, password: parsed.data.password };
  next();
}
