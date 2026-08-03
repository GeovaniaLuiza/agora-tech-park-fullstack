import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ value: { user: null, loading: false } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => state.value }));
import { ProtectedRoute, PublicOnlyRoute } from './RouteGuards';
afterEach(cleanup);
describe('proteção de rotas', () => {
  it('exibe loading durante restauração', () => {
    state.value = { user: null, loading: true };
    render(<MemoryRouter initialEntries={['/private']}><Routes><Route element={<ProtectedRoute />}><Route path="/private" element={<p>Privado</p>} /></Route></Routes></MemoryRouter>);
    expect(screen.getByRole('status')).toBeTruthy();
  });
  it('bloqueia perfil sem permissão', () => {
    state.value = { user: { role: 'RESIDENTE' }, loading: false };
    render(<MemoryRouter initialEntries={['/admin']}><Routes><Route element={<ProtectedRoute roles={['ADMIN']} />}><Route path="/admin" element={<p>Admin</p>} /></Route><Route path="/unauthorized" element={<p>Negado</p>} /></Routes></MemoryRouter>);
    expect(screen.getByText('Negado')).toBeTruthy();
  });
  it('impede usuário autenticado de voltar ao login', () => {
    state.value = { user: { role: 'GESTOR' }, loading: false };
    render(<MemoryRouter initialEntries={['/login']}><Routes><Route element={<PublicOnlyRoute />}><Route path="/login" element={<p>Login</p>} /></Route><Route path="/dashboard" element={<p>Dashboard</p>} /></Routes></MemoryRouter>);
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });
  it('trata perfil desconhecido antes da autorização por perfil', () => {
    state.value = { user: { role: 'LEGADO' }, loading: false };
    render(<MemoryRouter initialEntries={['/admin']}><Routes><Route element={<ProtectedRoute roles={['ADMIN']} />}><Route path="/admin" element={<p>Admin</p>} /></Route><Route path="/unknown-profile" element={<p>Perfil desconhecido</p>} /></Routes></MemoryRouter>);
    expect(screen.getByText('Perfil desconhecido')).toBeTruthy();
  });
});
