import { homeForRole } from '../config/access';

export function loginDestination(user, from) {
  // Preserve only the canonical invitation route, never an external redirect.
  return user.role === 'RESIDENTE' && typeof from === 'string'
    && /^\/resident\/forms\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/respond$/i.test(from)
    ? from : homeForRole(user.role);
}
