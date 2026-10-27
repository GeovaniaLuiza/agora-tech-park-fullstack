import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ProtectedRoute, PublicOnlyRoute } from '../components/RouteGuards';
import LoginPage from './LoginPage';
import { apiRequest, cancelIndicatorImport, confirmIndicatorImport, downloadOfficialIndicatorWorkbook, getIndicatorImportDraft, getOfficialWorkbookStatus, saveIndicatorImportReview, tokenStore, uploadIndicatorImport } from '../services/api';

const user = { id: 'manager', name: 'Gestora autenticada', role: 'ADMIN' };
const response = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers({ 'Retry-After': '647' }), text: async () => JSON.stringify(body), json: async () => body });
const operations = [
  ['upload/preview EVENTS', () => uploadIndicatorImport('EVENTS', 'center', new File(['xlsx'], 'Eventos.xlsx'))],
  ['upload/preview RESIDENTS', () => uploadIndicatorImport('RESIDENTS', 'center', new File(['xlsx'], 'Clientes.xlsx'))],
  ['lote atual', () => getIndicatorImportDraft('RESIDENTS', 'center')],
  ['salvar revisão', () => saveIndicatorImportReview('batch', [])],
  ['confirmar/atualizar indicadores', () => confirmIndicatorImport('batch')],
  ['descartar', () => cancelIndicatorImport('batch')],
  ['estado XLSX', () => getOfficialWorkbookStatus('center')],
  ['gerar/baixar XLSX', () => downloadOfficialIndicatorWorkbook({ centerId: 'center', year: 2026 })],
];
let fetchMock;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  tokenStore.set('valid-token', false);
  fetchMock = vi.fn().mockResolvedValueOnce(response(200, { user }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function ImportProbe({ operation }) {
  const { user: currentUser, restoreSession } = useAuth();
  const [result, setResult] = useState('');
  const run = async () => {
    try { await operation(); setResult('Sucesso'); }
    catch (error) { setResult(String(error.status)); }
  };
  return <><p>{currentUser?.name}</p><p>{result}</p><button onClick={run}>Executar importação</button><button onClick={restoreSession}>Verificar sessão</button></>;
}
const renderImport = (operation, path = '/indicadores/importar-residentes') => render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
  <Route element={<ProtectedRoute roles={['ADMIN']} />}><Route path="/indicadores/:page" element={<ImportProbe operation={operation} />} /></Route>
  <Route element={<PublicOnlyRoute />}><Route path="/login" element={<LoginPage />} /></Route>
</Routes></AuthProvider></MemoryRouter>);

describe('autenticação durante operações de importação', () => {
  it.each(operations.flatMap(([label, operation]) => [403, 409, 422, 429, 500].map((status) => [label, operation, status])))('%s / %s preserva token e usuário', async (_label, operation, status) => {
    fetchMock.mockResolvedValueOnce(response(status));
    renderImport(operation);
    await screen.findByText(user.name);
    fireEvent.click(screen.getByRole('button', { name: 'Executar importação' }));
    await screen.findByText(String(status));
    expect(screen.getByText(user.name)).toBeTruthy();
    expect(tokenStore.get()).toBe('valid-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => /\/auth\/(login|logout|refresh)$/.test(url))).toBe(false);
  });

  it.each([401])('401 expirado encerra sessão, sem refresh inexistente nem POST /login automático', async (status) => {
    fetchMock.mockResolvedValueOnce(response(status, { code: 'TOKEN_EXPIRED' }));
    renderImport(() => confirmIndicatorImport('batch'));
    await screen.findByText(user.name);
    fireEvent.click(screen.getByRole('button', { name: 'Executar importação' }));
    await screen.findByRole('button', { name: /^entrar/i });
    expect(tokenStore.get()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => /\/auth\/(login|logout|refresh)$/.test(url))).toBe(false);
  });

  it.each([403, 409, 422, 429, 500, 503])('revalidação /me %s bloqueia operação até confirmar a sessão novamente', async (status) => {
    fetchMock.mockResolvedValueOnce(response(status));
    renderImport(() => confirmIndicatorImport('batch'));
    await screen.findByText(user.name);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar sessão' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: 'Retomar sessão' });
    expect(screen.queryByText(user.name)).toBeNull();
    expect(tokenStore.get()).toBe('valid-token');
    expect(screen.queryByRole('button', { name: /^entrar/i })).toBeNull();
  });

  it.each([500, 503, 429])('reload com /me %s permite recuperar na rota original sem novo login', async (status) => {
    fetchMock.mockReset().mockResolvedValueOnce(response(status));
    renderImport(() => confirmIndicatorImport('batch'));
    const retry = await screen.findByRole('button', { name: 'Retomar sessão' });
    expect(tokenStore.get()).toBe('valid-token');
    expect(screen.queryByRole('button', { name: /^entrar/i })).toBeNull();
    fetchMock.mockResolvedValueOnce(response(200, { user }));
    fireEvent.click(retry);
    await screen.findByText(user.name);
    expect(fetchMock.mock.calls.every(([url]) => url.endsWith('/auth/me'))).toBe(true);
  });

  it.each(['/indicadores/importar-eventos', '/indicadores/importar-residentes'])('%s mantém sessão após sete horas de revisão sem timer artificial ou login automático', async (path) => {
    renderImport(() => confirmIndicatorImport('batch'), path);
    await screen.findByText(user.name);
    vi.useFakeTimers();
    await act(async () => vi.advanceTimersByTime(7 * 60 * 60 * 1000));
    expect(screen.getByText(user.name)).toBeTruthy();
    expect(tokenStore.get()).toBe('valid-token');
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockResolvedValueOnce(response(200));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Executar importação' })));
    expect(screen.getByText('Sucesso')).toBeTruthy();
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer valid-token');
  });

  it('401 atrasado de importação não apaga uma sessão nova', async () => {
    let finish;
    fetchMock.mockReset().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const unauthorized = vi.fn();
    window.addEventListener('auth:unauthorized', unauthorized);
    try {
      const pending = confirmIndicatorImport('batch');
      tokenStore.set('new-token', true);
      finish(response(401, { code: 'TOKEN_EXPIRED' }));
      await expect(pending).rejects.toMatchObject({ status: 401 });
      expect(tokenStore.get()).toBe('new-token');
      expect(unauthorized).not.toHaveBeenCalled();
    } finally { window.removeEventListener('auth:unauthorized', unauthorized); }
  });

  it.each([200, 401])('/me atrasado após login com HTTP %s não substitui nem limpa uma sessão mais nova', async (status) => {
    let finish;
    function LoginProbe() {
      const { user: currentUser, login } = useAuth();
      return <><p>{currentUser?.name}</p><button onClick={() => { void login('manager@test.invalid', 'Password123').catch(() => {}); }}>Novo login</button></>;
    }
    fetchMock.mockResolvedValueOnce(response(200, { token: 'older-login-token' }))
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<AuthProvider><LoginProbe /></AuthProvider>);
    await screen.findByText(user.name);
    fireEvent.click(screen.getByRole('button', { name: 'Novo login' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    fetchMock.mockResolvedValueOnce(response(200, { token: 'latest-login-token' }))
      .mockResolvedValueOnce(response(200, { user: { ...user, name: 'Sessão mais nova' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Novo login' }));
    await screen.findByText('Sessão mais nova');
    await act(async () => finish(response(status, status === 200 ? { user: { ...user, name: 'Sessão antiga' } } : { code: 'TOKEN_EXPIRED' })));
    expect(tokenStore.get()).toBe('latest-login-token');
    expect(screen.getByText('Sessão mais nova')).toBeTruthy();
    expect(screen.queryByText('Sessão antiga')).toBeNull();
  });

  it('credenciais inválidas no endpoint público não apagam token existente', async () => {
    fetchMock.mockReset().mockResolvedValueOnce(response(401, { code: 'INVALID_CREDENTIALS' }));
    await expect(apiRequest('/auth/login', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 401 });
    expect(tokenStore.get()).toBe('valid-token');
  });
});
