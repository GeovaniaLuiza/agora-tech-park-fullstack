import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  tokenStore: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));
vi.mock('../services/api', () => api);
import { AuthProvider, useAuth } from './AuthContext';

function Probe() {
  const { user, loading, login, logout, sessionError } = useAuth();
  return <div><span>{loading ? 'loading' : user?.name || 'visitor'}</span><span>{sessionError}</span><button onClick={() => login('ADMIN@AGORA.TEST', 'Senha123', true)}>login</button><button onClick={logout}>logout</button></div>;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('restauração e encerramento da sessão', () => {
  it('restaura identidade confiável usando /me', async () => {
    api.tokenStore.get.mockReturnValue('token');
    api.getMe.mockResolvedValue({ user: { id: '1', name: 'Gestora', role: 'GESTOR' } });
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByText('loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Gestora')).toBeTruthy());
    expect(api.getMe).toHaveBeenCalledOnce();
  });
  it('limpa token e usuário no logout', async () => {
    api.tokenStore.get.mockReturnValue(null);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('visitor')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'logout' }));
    expect(api.tokenStore.clear).toHaveBeenCalled();
  });
  it('notifica o backend antes de encerrar uma sessão existente', async () => {
    api.tokenStore.get.mockReturnValue('token');
    api.getMe.mockResolvedValue({ user: { id: '1', name: 'Admin', role: 'ADMIN' } });
    api.logout.mockResolvedValue(null);
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('Admin');
    fireEvent.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() => expect(api.logout).toHaveBeenCalledOnce());
    expect(api.tokenStore.clear).toHaveBeenCalled();
  });
  it('confirma o perfil autenticado em /me antes de atualizar a sessão', async () => {
    api.tokenStore.get.mockReturnValue(null);
    api.login.mockResolvedValue({ token: 'token', user: { name: 'Resposta inicial', role: 'ADMIN' } });
    api.getMe.mockResolvedValue({ user: { id: '1', name: 'Admin confirmado', role: 'ADMIN' } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('visitor')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'login' }));
    await waitFor(() => expect(screen.getByText('Admin confirmado')).toBeTruthy());
    expect(api.tokenStore.set).toHaveBeenCalledWith('token', true);
    expect(api.getMe).toHaveBeenCalledOnce();
  });
  it('exibe erro e limpa token quando a restauração falha', async () => {
    api.tokenStore.get.mockReturnValue('token');
    api.getMe.mockRejectedValue(new Error('expirada'));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(/não pôde ser restaurada/i)).toBeTruthy());
    expect(api.tokenStore.clear).toHaveBeenCalled();
    expect(screen.getByText('visitor')).toBeTruthy();
  });
});
