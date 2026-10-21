import jwt from 'jsonwebtoken';
import { findAuthenticationProfile } from '../repositories/userRepository.js';
import { ROLE_VALUES, ROLES, USER_STATUS } from '../domain/accessControl.js';

function rejectAuthentication(req, res, code, message = 'Sessão inválida ou expirada') {
  req.log?.warn({ event: 'authentication_rejected', reason: code, requestId: req.id }, 'Authentication rejected');
  return res.status(401).json({ message, code });
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return rejectAuthentication(req, res, 'AUTH_REQUIRED', 'Autenticação necessária');
  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
      return rejectAuthentication(req, res, error instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN');
    }
    return next(error);
  }
  if (!payload || typeof payload.sub !== 'string' || !payload.sub ||
      (payload.sv !== undefined && (!Number.isSafeInteger(payload.sv) || payload.sv < 0))) {
    return rejectAuthentication(req, res, 'INVALID_TOKEN');
  }
  try {
    const user = await findAuthenticationProfile(payload.sub);
    if (!user || user.status !== USER_STATUS.ACTIVE || !user.email_verified_at || !ROLE_VALUES.includes(user.role)) {
      return rejectAuthentication(req, res, 'SESSION_INVALID');
    }
    if (user.role === ROLES.RESIDENT && !user.organizations.length) return rejectAuthentication(req, res, 'SESSION_INVALID');
    if (user.session_version !== (payload.sv ?? 0)) return rejectAuthentication(req, res, 'SESSION_REVOKED');
    req.user = { sub: user.id, email: user.email, name: user.name, role: user.role, status: user.status };
    req.sessionVersion = user.session_version;
    next();
  } catch (error) {
    // A profile/database outage is not proof that the Bearer token is invalid.
    return next(error);
  }
}

export const authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ message: 'Permissão insuficiente' });
