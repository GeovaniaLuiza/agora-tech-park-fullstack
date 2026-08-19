import jwt from 'jsonwebtoken';
import { findPublicProfile } from '../repositories/userRepository.js';
import { ROLE_VALUES, ROLES, USER_STATUS } from '../domain/accessControl.js';

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Autenticação necessária' });
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const user = await findPublicProfile(payload.sub);
    if (!user || user.status !== USER_STATUS.ACTIVE || !user.email_verified_at || !ROLE_VALUES.includes(user.role)) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada' });
    }
    if (user.role === ROLES.RESIDENT && !user.organizations.length) return res.status(401).json({ message: 'Sessão inválida ou expirada' });
    req.user = { sub: user.id, email: user.email, name: user.name, role: user.role, status: user.status };
    next();
  } catch {
    return res.status(401).json({ message: 'Sessão inválida ou expirada' });
  }
}

export const authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ message: 'Permissão insuficiente' });
