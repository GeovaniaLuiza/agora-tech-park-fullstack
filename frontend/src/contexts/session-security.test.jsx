import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { ProtectedRoute } from '../components/RouteGuards';
import { apiRequest, downloadDashboardSpreadsheet, downloadIndicatorReport, downloadOfficialIndicatorWorkbook, LOGOUT_STORAGE_KEY, logout as apiLogout, tokenStore } from '../services/api';

const user = { id: 'admin', name: 'Admin', role: 'ADMIN' };
const response = (status = 200, body = { user }) => ({ status, ok: status < 400, headers: new Headers(), text: async () => JSON.stringify(body), json: async () => body });
let fetchMock;
let operation;
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function Page() {
  const { logout, restoreSession, updateAvatar, login } = useAuth();
  return <><p>Operação administrativa</p><input aria-label="Rascunho" /><button onClick={logout}>Sair</button><button onClick={restoreSession}>Revalidar</button>
    <button onClick={() => { void operation().catch(() => {}); }}>Exportar</button>
    <button onClick={() => { void updateAvatar('image'); }}>Avatar</button>
    <button onClick={() => { void login('admin@test.invalid', 'Password123'); }}>Login</button></>;
}
const mount = () => render(<MemoryRouter initialEntries={['/admin']}><AuthProvider><Routes>
  <Route element={<ProtectedRoute roles={['ADMIN']} />}><Route path="/admin" element={<Page />} /></Route>
  <Route path="/login" element={<p>Login necessário</p>} />
  <Route path="/unauthorized" element={<p>Sem permissão</p>} />
</Routes></AuthProvider></MemoryRouter>);

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  fetchMock = vi.fn().mockResolvedValue(response());
  vi.stubGlobal('fetch', fetchMock);
  tokenStore.set('valid-token', false);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('protected UI and cross-tab logout', () => {
  it('never renders protected content when both storages are empty', async () => {
    tokenStore.clear(); mount();
    expect(screen.queryByText('Operação administrativa')).toBeNull();
    await screen.findByText('Login necessário');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('resuming an unauthenticated tab does not cancel a login already in flight', async () => {
    function LoginProbe() {
      const { user: current, loading, login } = useAuth();
      return <><p>{loading ? 'Restoring' : current?.name || 'Visitor'}</p><button onClick={() => { void login('admin@test.invalid', 'Password123'); }}>Authenticate</button></>;
    }
    const pending = deferred(); tokenStore.clear();
    render(<AuthProvider><LoginProbe /></AuthProvider>);
    await screen.findByText('Visitor');
    fetchMock.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByText('Authenticate'));
    fireEvent(window, new Event('focus'));
    await act(async () => pending.resolve(response(200, { token: 'new-token' })));
    await screen.findByText('Admin');
    expect(tokenStore.get()).toBe('new-token');
  });
  it('unmounts operations before logout completes and sends the captured token', async () => {
    const pending = deferred();
    mount(); await screen.findByText('Operação administrativa');
    fetchMock.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByText('Sair'));
    await screen.findByText('Login necessário');
    expect(tokenStore.get()).toBeNull();
    expect(localStorage.getItem(LOGOUT_STORAGE_KEY)).toBeTruthy();
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer valid-token');
    await act(async () => pending.resolve(response(503, {})));
    expect(screen.queryByText('Operação administrativa')).toBeNull();
  });
  it.each([false, true])('receives a logout from another tab (remember=%s) without repeating logout', async (remember) => {
    tokenStore.set('valid-token', remember); mount();
    await screen.findByText('Operação administrativa');
    fireEvent(window, new StorageEvent('storage', { key: LOGOUT_STORAGE_KEY, newValue: 'remote-logout' }));
    await screen.findByText('Login necessário');
    expect(tokenStore.get()).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(['focus', 'pageshow'])('revalidates on %s and removes a remotely revoked session', async (event) => {
    mount(); await screen.findByText('Operação administrativa');
    fetchMock.mockResolvedValueOnce(response(401, { code: 'SESSION_REVOKED' }));
    fireEvent(window, new Event(event));
    await screen.findByText('Login necessário');
    expect(tokenStore.get()).toBeNull();
  });
  it('blocks operations while session verification is unavailable, then recovers', async () => {
    mount(); await screen.findByText('Operação administrativa');
    fetchMock.mockResolvedValueOnce(response(503, {}));
    fireEvent.click(screen.getByText('Revalidar'));
    const retry = await screen.findByText('Retomar sessão');
    expect(screen.queryByText('Operação administrativa')).toBeNull();
    expect(tokenStore.get()).toBe('valid-token');
    fireEvent.click(retry);
    await screen.findByText('Operação administrativa');
  });
  it.each(['network', 'timeout'])('recovers from a %s failure in /me without losing the token or repeating login', async (failure) => {
    mount(); await screen.findByText('Operação administrativa');
    fetchMock.mockRejectedValueOnce(failure === 'network' ? new TypeError('Failed to fetch') : new DOMException('aborted', 'AbortError'));
    fireEvent.click(screen.getByText('Revalidar'));
    const retry = await screen.findByText('Retomar sessão');
    expect(screen.queryByText('Operação administrativa')).toBeNull();
    expect(tokenStore.get()).toBe('valid-token');
    fireEvent.click(retry);
    await screen.findByText('Operação administrativa');
    expect(fetchMock.mock.calls.every(([url]) => url.endsWith('/auth/me'))).toBe(true);
  });
  it('finishes local logout even when the network fails, without restoring access on reconnection', async () => {
    mount(); await screen.findByText('Operação administrativa');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByText('Sair'));
    await screen.findByText('Login necessário');
    expect(tokenStore.get()).toBeNull();
    expect(localStorage.getItem(LOGOUT_STORAGE_KEY)).toBeTruthy();
    fireEvent(window, new Event('focus'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Operação administrativa')).toBeNull();
  });
  it('preserves an unsaved form during successful background revalidation', async () => {
    const pending = deferred(); mount(); await screen.findByText('Operação administrativa');
    fireEvent.change(screen.getByLabelText('Rascunho'), { target: { value: 'unsaved' } });
    fetchMock.mockReturnValueOnce(pending.promise);
    fireEvent(window, new Event('focus'));
    expect(screen.getByLabelText('Rascunho').value).toBe('unsaved');
    await act(async () => pending.resolve(response()));
    expect(screen.getByLabelText('Rascunho').value).toBe('unsaved');
  });
  it('a protected 401 clears stale identity even when the token has disappeared', async () => {
    operation = () => apiRequest('/admin/users'); mount(); await screen.findByText('Operação administrativa');
    tokenStore.clear();
    fetchMock.mockResolvedValueOnce(response(401, {}));
    fireEvent.click(screen.getByText('Exportar'));
    await screen.findByText('Login necessário');
  });
  it('invalidates a 401 before attempting to read a broken response body', async () => {
    operation = () => apiRequest('/admin/users'); mount(); await screen.findByText('Operação administrativa');
    fetchMock.mockResolvedValueOnce({ ...response(401), text: async () => { throw new Error('body interrupted'); } });
    fireEvent.click(screen.getByText('Exportar'));
    await screen.findByText('Login necessário');
    expect(tokenStore.get()).toBeNull();
  });
  it('a delayed logout 401 does not invalidate a newer pending login without a stored token', async () => {
    const pending = deferred(); tokenStore.clear();
    const onUnauthorized = vi.fn();
    window.addEventListener('auth:unauthorized', onUnauthorized);
    try {
      fetchMock.mockReturnValueOnce(pending.promise);
      const request = apiLogout('old-token');
      pending.resolve(response(401, {}));
      await expect(request).rejects.toMatchObject({ status: 401 });
      expect(onUnauthorized).not.toHaveBeenCalled();
    } finally { window.removeEventListener('auth:unauthorized', onUnauthorized); }
  });
  it('does not restore an identity from /me that completes after a cross-tab logout', async () => {
    const pending = deferred(); fetchMock.mockReturnValueOnce(pending.promise);
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent(window, new StorageEvent('storage', { key: LOGOUT_STORAGE_KEY, newValue: 'logout' }));
    await screen.findByText('Login necessário');
    await act(async () => pending.resolve(response()));
    expect(screen.queryByText('Operação administrativa')).toBeNull();
  });
  it('does not restore an identity from an avatar response arriving after logout', async () => {
    const pending = deferred(); mount(); await screen.findByText('Operação administrativa');
    fetchMock.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByText('Avatar'));
    fireEvent(window, new StorageEvent('storage', { key: LOGOUT_STORAGE_KEY, newValue: 'logout' }));
    await screen.findByText('Login necessário');
    await act(async () => pending.resolve(response()));
    expect(screen.queryByText('Operação administrativa')).toBeNull();
  });
  it('does not persist a login response arriving after logout', async () => {
    const pending = deferred(); mount(); await screen.findByText('Operação administrativa');
    fetchMock.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByText('Login'));
    fireEvent(window, new StorageEvent('storage', { key: LOGOUT_STORAGE_KEY, newValue: 'logout' }));
    await screen.findByText('Login necessário');
    await act(async () => pending.resolve(response(200, { token: 'late-token' })));
    expect(tokenStore.get()).toBeNull();
    expect(screen.queryByText('Operação administrativa')).toBeNull();
  });
  it('removes operational access when the JWT expires without another API request', async () => {
    vi.useFakeTimers();
    const exp = Math.floor(Date.now() / 1000) + 60;
    tokenStore.set(`header.${btoa(JSON.stringify({ exp }))}.signature`, false);
    await act(async () => { mount(); });
    expect(screen.getByText('Operação administrativa')).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(61000));
    expect(screen.getByText('Login necessário')).toBeTruthy();
    expect(tokenStore.get()).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('an old expiration timer cannot clear a newer token awaiting /me', async () => {
    vi.useFakeTimers();
    const pending = deferred();
    const exp = Math.floor(Date.now() / 1000) + 2;
    tokenStore.set(`header.${btoa(JSON.stringify({ exp }))}.signature`, false);
    await act(async () => { mount(); });
    fetchMock.mockResolvedValueOnce(response(200, { token: 'new-token' })).mockReturnValueOnce(pending.promise);
    await act(async () => fireEvent.click(screen.getByText('Login')));
    await act(async () => vi.advanceTimersByTime(3000));
    expect(tokenStore.get()).toBe('new-token');
    await act(async () => pending.resolve(response()));
    expect(screen.getByText('Operação administrativa')).toBeTruthy();
  });
  it.each([
    ['dashboard', () => downloadDashboardSpreadsheet()],
    ['CSV', () => downloadIndicatorReport('csv')],
    ['PDF', () => downloadIndicatorReport('pdf')],
    ['workbook', () => downloadOfficialIndicatorWorkbook({})],
  ])('a 401 exporting %s removes access and notifies other tabs', async (_name, exportOperation) => {
    operation = exportOperation; mount(); await screen.findByText('Operação administrativa');
    fetchMock.mockResolvedValueOnce(response(401, { code: 'SESSION_REVOKED' }));
    fireEvent.click(screen.getByText('Exportar'));
    await screen.findByText('Login necessário');
    expect(tokenStore.get()).toBeNull();
    expect(localStorage.getItem(LOGOUT_STORAGE_KEY)).toBeTruthy();
  });
  it('keeps a newer login when a delayed export rejects the old token', async () => {
    const pending = deferred();
    fetchMock.mockReturnValueOnce(pending.promise);
    const exportPromise = downloadDashboardSpreadsheet();
    tokenStore.set('new-token', true);
    pending.resolve(response(401, {}));
    await expect(exportPromise).rejects.toMatchObject({ status: 401 });
    expect(tokenStore.get()).toBe('new-token');
    expect(localStorage.getItem(LOGOUT_STORAGE_KEY)).toBeNull();
  });
});
