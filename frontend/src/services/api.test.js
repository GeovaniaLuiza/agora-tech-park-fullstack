import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, tokenStore } from './api';
describe('armazenamento da sessão', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it('usa sessionStorage quando lembrar-me está desmarcado', () => {
    tokenStore.set('session-token', false);
    expect(sessionStorage.getItem('token')).toBe('session-token');
    expect(localStorage.getItem('token')).toBeNull();
  });
  it('usa localStorage quando lembrar-me está marcado e limpa no logout', () => {
    tokenStore.set('persistent-token', true);
    expect(localStorage.getItem('token')).toBe('persistent-token');
    tokenStore.clear();
    expect(tokenStore.get()).toBeNull();
  });
});

describe('erros da API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserva metadados e Retry-After de uma resposta 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '42' }),
      text: async () => JSON.stringify({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Muitas tentativas foram realizadas.',
        retryAfter: 41,
        retryAfterSeconds: 42,
        requestCreated: false,
      }),
    }));

    await expect(apiRequest('/auth/register-request', { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 41,
        retryAfterSeconds: 41,
        requestCreated: false,
      });
  });

  it.each([200, 202])('retorna normalmente uma resposta %s que possui message', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status,
      headers: new Headers(),
      text: async () => JSON.stringify({ message: 'Solicitação processada.', status: 'REQUEST_ACCEPTED' }),
    }));
    await expect(apiRequest('/auth/resend-verification', { method: 'POST', body: '{}' }))
      .resolves.toMatchObject({ message: 'Solicitação processada.', status: 'REQUEST_ACCEPTED' });
  });

  it('distingue falha de rede de uma resposta HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiRequest('/auth/resend-verification', { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR', networkError: true });
  });

  it('mantém uma mensagem textual quando o servidor não retorna JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers(),
      text: async () => 'Serviço temporariamente indisponível',
    }));

    await expect(apiRequest('/health')).rejects.toMatchObject({
      status: 502,
      message: 'Serviço temporariamente indisponível',
    });
  });
});
