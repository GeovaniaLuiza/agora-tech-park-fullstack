export const USER_ROLES = ['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE'];

export const ROLE_HOME = {
  ADMIN: '/admin',
  PESQUISADOR: '/pesquisa',
  GESTOR: '/dashboard',
  RESIDENTE: '/residente',
};

export const ROUTE_ROLES = {
  '/admin': ['ADMIN'],
  '/admin/solicitacoes': ['ADMIN'],
  '/dashboard': ['ADMIN', 'PESQUISADOR', 'GESTOR'],
  '/pesquisa': ['ADMIN', 'PESQUISADOR'],
  '/forms': ['ADMIN', 'PESQUISADOR'],
  '/forms/new': ['ADMIN', 'PESQUISADOR'],
  '/indicators': ['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE'],
  '/organizations': ['ADMIN', 'PESQUISADOR', 'GESTOR'],
  '/admin/requests': ['ADMIN'],
  '/resident/forms': ['RESIDENTE'],
  '/residente': ['RESIDENTE'],
  '/resident/history': ['RESIDENTE'],
};

export const isKnownRole = (role) => USER_ROLES.includes(role);
export const homeForRole = (role) => ROLE_HOME[role] || '/unknown-profile';
export const canAccess = (role, path) => (ROUTE_ROLES[path] || []).includes(role);
