import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { PublicOnlyRoute } from '../components/RouteGuards';
import { tokenStore } from '../services/api';
import LoginPage from './LoginPage';

const response = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  text: async () => JSON.stringify(body),
});
const user = { id: '1', name: 'Gestora', role: 'GESTOR' };
let fetchMock;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const renderLogin = () => render(<MemoryRouter initialEntries={['/login']}><AuthProvider><Routes>
  <Route element={<PublicOnlyRoute />}><Route path="/login" element={<LoginPage />} /></Route>
  <Route path="/dashboard" element={<p>Painel autenticado</p>} />
</Routes></AuthProvider></MemoryRouter>);
const submitLogin = () => {
  fireEvent.change(screen.getByLabelText(/^e-mail/i), { target: { value: 'gestora@test.com' } });
  fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: 'Senha123' } });
  fireEvent.click(screen.getByRole('button', { name: /^entrar/i }));
};

describe('rate limit na autenticação com API e armazenamento reais', () => {
  it.each(['retryAfter', 'retryAfterSeconds'])('login 429 usa %s e libera nova tentativa após o cooldown', async (field) => {
    fetchMock.mockResolvedValueOnce(response(429, { [field]: 2 }));
    renderLogin();
    await screen.findByRole('button', { name: /^entrar/i });
    vi.useFakeTimers();
    await act(async () => submitLogin());
    expect(screen.getByText(/aguarde 2 segundos/i)).toBeTruthy();
    expect(screen.queryByText(/e-mail ou senha inválidos/i)).toBeNull();
    const button = screen.getByRole('button', { name: /tente novamente em 2s/i });
    expect(button.disabled).toBe(true);
    fireEvent.submit(button.closest('form'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1000));
    await act(async () => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: /^entrar/i }).disabled).toBe(false);
    fetchMock.mockResolvedValueOnce(response(200, { token: 'new-token' }))
      .mockResolvedValueOnce(response(200, { user }));
    await act(async () => submitLogin());
    expect(screen.getByText('Painel autenticado')).toBeTruthy();
    expect(tokenStore.get()).toBe('new-token');
  });

  it('login 429 sem prazo orienta nova tentativa sem inventar duração', async () => {
    fetchMock.mockResolvedValue(response(429));
    renderLogin();
    await screen.findByRole('button', { name: /^entrar/i });
    submitLogin();
    expect(await screen.findByText(/aguarde alguns instantes e tente novamente/i)).toBeTruthy();
    expect(screen.queryByText(/e-mail ou senha inválidos/i)).toBeNull();
  });

  it('login 401 continua informando credenciais inválidas', async () => {
    fetchMock.mockResolvedValue(response(401, { code: 'INVALID_CREDENTIALS' }));
    renderLogin();
    await screen.findByRole('button', { name: /^entrar/i });
    submitLogin();
    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeTruthy();
    expect(tokenStore.get()).toBeNull();
  });

  it.each([false, true])('/me 429 preserva token na restauração (lembrar=%s) e permite retomar', async (remember) => {
    tokenStore.set('saved-token', remember);
    fetchMock.mockResolvedValueOnce(response(429, {}, { 'Retry-After': '1' }));
    renderLogin();
    await screen.findByText(/aguarde 1 segundo/i);
    expect(tokenStore.get()).toBe('saved-token');
    expect((remember ? localStorage : sessionStorage).getItem('token')).toBe('saved-token');
    const retry = await screen.findByRole('button', { name: /retomar sessão/i }, { timeout: 3000 });
    fetchMock.mockResolvedValueOnce(response(200, { user }));
    fireEvent.click(retry);
    expect(await screen.findByText('Painel autenticado')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => url.endsWith('/auth/me'))).toBe(true);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer saved-token');
  });

  it.each([false, true])('/me 429 após login preserva o novo token (lembrar=%s)', async (remember) => {
    fetchMock.mockResolvedValueOnce(response(200, { token: 'login-token' }))
      .mockResolvedValueOnce(response(429));
    renderLogin();
    await screen.findByRole('button', { name: /^entrar/i });
    if (remember) fireEvent.click(screen.getByLabelText(/lembrar-me/i));
    submitLogin();
    const retry = await screen.findByRole('button', { name: /retomar sessão/i });
    expect((remember ? localStorage : sessionStorage).getItem('token')).toBe('login-token');
    expect(screen.queryByText(/e-mail ou senha inválidos/i)).toBeNull();
    fetchMock.mockResolvedValueOnce(response(200, { user }));
    fireEvent.click(retry);
    expect(await screen.findByText('Painel autenticado')).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/login'))).toHaveLength(1);
  });

  it.each([401, 403])('/me %s encerra sessão na restauração', async (status) => {
    tokenStore.set('invalid-token', true);
    fetchMock.mockResolvedValue(response(status));
    renderLogin();
    await screen.findByRole('button', { name: /^entrar/i });
    await waitFor(() => expect(tokenStore.get()).toBeNull());
    expect(screen.queryByRole('button', { name: /retomar sessão/i })).toBeNull();
  });

  it.each([401, 403])('/me %s após login remove o token recém-emitido', async (status) => {
    fetchMock.mockResolvedValueOnce(response(200, { token: 'invalid-token' }))
      .mockResolvedValue(response(status));
    renderLogin();
    await screen.findByRole('button', { name: /^entrar/i });
    submitLogin();
    await screen.findByText('E-mail ou senha inválidos.');
    expect(tokenStore.get()).toBeNull();
  });

  it('429 ao revalidar preserva também o usuário já carregado', async () => {
    function Probe() {
      const { user: currentUser, sessionError, restoreSession } = useAuth();
      return <><p>{currentUser?.name}</p><p>{sessionError}</p><button onClick={restoreSession}>Revalidar</button></>;
    }
    tokenStore.set('saved-token', false);
    fetchMock.mockResolvedValueOnce(response(200, { user })).mockResolvedValueOnce(response(429));
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('Gestora');
    fireEvent.click(screen.getByRole('button', { name: 'Revalidar' }));
    await screen.findByText(/aguarde alguns instantes/i);
    expect(screen.getByText('Gestora')).toBeTruthy();
    expect(tokenStore.get()).toBe('saved-token');
  });
});
