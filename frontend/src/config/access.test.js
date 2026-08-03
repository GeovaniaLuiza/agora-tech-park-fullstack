import { describe, expect, it } from 'vitest';
import { canAccess, homeForRole } from './access';

describe('redirecionamento e permissões por perfil', () => {
  it.each([
    ['ADMIN', '/admin'], ['PESQUISADOR', '/pesquisa'], ['GESTOR', '/dashboard'], ['RESIDENTE', '/residente'],
  ])('direciona %s para %s', (role, path) => expect(homeForRole(role)).toBe(path));

  it('protege páginas administrativas e de residente', () => {
    expect(canAccess('ADMIN', '/admin/requests')).toBe(true);
    expect(canAccess('ADMIN', '/admin')).toBe(true);
    expect(canAccess('GESTOR', '/admin/requests')).toBe(false);
    expect(canAccess('RESIDENTE', '/resident/history')).toBe(true);
    expect(canAccess('RESIDENTE', '/dashboard')).toBe(false);
  });

  it('direciona perfil desconhecido para um estado seguro', () => {
    expect(homeForRole('LEGADO')).toBe('/unknown-profile');
  });
});
