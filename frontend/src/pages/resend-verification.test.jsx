import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ resendVerification: vi.fn() }));
vi.mock('../services/api', async (original) => ({
  ...(await original()),
  resendVerification: api.resendVerification,
}));

import ResendVerificationPage from './ResendVerificationPage';

const PUBLIC_MESSAGE = /solicitação processada.*se existir um cadastro pendente.*caixa de spam/i;
const renderPage = (entry = '/reenviar-confirmacao') =>
  render(<MemoryRouter initialEntries={[entry]}><ResendVerificationPage /></MemoryRouter>);
const fillAndSubmit = (email = 'pessoa@test.com') => {
  fireEvent.change(screen.getByLabelText(/e-mail da solicitação/i), { target: { value: email } });
  fireEvent.submit(screen.getByRole('button', { name: /enviar novo link/i }).closest('form'));
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('reenvio de confirmação', () => {
  it('abre com o e-mail recebido da tela de cadastro', () => {
    renderPage({ pathname: '/reenviar-confirmacao', state: { email: 'pessoa@test.com' } });
    expect(screen.getByLabelText(/e-mail da solicitação/i).value).toBe('pessoa@test.com');
  });

  it.each([200, 202])('trata resultado HTTP %s como informação e nunca como erro visual', async () => {
    api.resendVerification.mockResolvedValue({
      message: 'Resposta pública da API',
      status: 'REQUEST_ACCEPTED',
      nextAction: 'CHECK_EMAIL',
    });
    renderPage();
    fillAndSubmit(' Pessoa@Test.com ');

    await waitFor(() => expect(api.resendVerification).toHaveBeenCalledWith('pessoa@test.com'));
    const feedback = await screen.findByRole('status');
    expect(feedback.textContent).toMatch(PUBLIC_MESSAGE);
    expect(feedback.classList.contains('auth-alert--info')).toBe(true);
    expect(feedback.classList.contains('auth-alert--error')).toBe(false);
    expect(screen.queryByText(/e-mail enviado/i)).toBeNull();
  });

  it('usa a mesma resposta pública para endereço existente ou inexistente', async () => {
    api.resendVerification.mockResolvedValue({ status: 'REQUEST_ACCEPTED', nextAction: 'CHECK_EMAIL' });
    const first = renderPage();
    fillAndSubmit('existente@test.com');
    const existingText = (await screen.findByRole('status')).textContent;
    first.unmount();

    renderPage();
    fillAndSubmit('inexistente@test.com');
    const unknownText = (await screen.findByRole('status')).textContent;
    expect(unknownText).toBe(existingText);
  });

  it('mantém o botão desabilitado e bloqueia cliques repetidos durante a requisição', async () => {
    let resolveRequest;
    api.resendVerification.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    renderPage();
    fillAndSubmit();
    fireEvent.submit(screen.getByRole('button', { name: /enviando/i }).closest('form'));

    expect(screen.getByRole('button', { name: /enviando/i }).disabled).toBe(true);
    expect(api.resendVerification).toHaveBeenCalledTimes(1);
    await act(async () => resolveRequest({ status: 'REQUEST_ACCEPTED' }));
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('apresenta falha real de entrega em alerta vermelho e mantém o e-mail', async () => {
    api.resendVerification.mockRejectedValue({ status: 503, code: 'EMAIL_DELIVERY_FAILED' });
    renderPage();
    fillAndSubmit();

    const feedback = await screen.findByRole('alert');
    expect(feedback.textContent).toMatch(/não foi possível enviar o e-mail de confirmação/i);
    expect(feedback.classList.contains('auth-alert--error')).toBe(true);
    expect(screen.getByLabelText(/e-mail da solicitação/i).value).toBe('pessoa@test.com');
  });

  it('trata 429 como aviso, aplica Retry-After e limpa o timer ao desmontar', async () => {
    vi.useFakeTimers();
    api.resendVerification.mockRejectedValue({
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 61,
    });
    const view = renderPage();
    await act(async () => fillAndSubmit());

    const feedback = screen.getByRole('status');
    expect(feedback.textContent).toMatch(/aguarde 1 minuto e 1 segundo/i);
    expect(feedback.classList.contains('auth-alert--warning')).toBe(true);
    expect(screen.getByRole('button', { name: /tente novamente em 61s/i }).disabled).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: /tente novamente em 60s/i }).disabled).toBe(true);
    for (let second = 0; second < 60; second += 1) {
      await act(async () => vi.advanceTimersByTime(1000));
    }
    expect(screen.getByRole('button', { name: /enviar novo link/i }).disabled).toBe(false);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([400, 422])('apresenta HTTP %s como erro de validação sem limpar o e-mail', async (status) => {
    api.resendVerification.mockRejectedValue({
      status,
      code: 'INVALID_EMAIL',
      message: 'Informe um endereço de e-mail válido.',
    });
    renderPage();
    fillAndSubmit('valor@invalido');

    expect((await screen.findByRole('alert')).textContent).toMatch(/endereço de e-mail válido/i);
    expect(screen.getByLabelText(/e-mail da solicitação/i).value).toBe('valor@invalido');
    expect(screen.getByRole('button', { name: /enviar novo link/i }).disabled).toBe(false);
  });

  it('apresenta falha de rede controlada e permite nova tentativa', async () => {
    api.resendVerification.mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' });
    renderPage();
    fillAndSubmit();

    expect((await screen.findByRole('alert')).textContent).toMatch(/não foi possível acessar o serviço/i);
    expect(screen.getByRole('button', { name: /enviar novo link/i }).disabled).toBe(false);
    expect(screen.getByLabelText(/e-mail da solicitação/i).value).toBe('pessoa@test.com');
  });

  it('mantém a página renderizada após erro inesperado e não recarrega o formulário', async () => {
    api.resendVerification.mockRejectedValue({ status: 500, code: 'UNEXPECTED' });
    renderPage();
    fillAndSubmit();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /reenviar confirmação/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /enviar novo link/i })).toBeTruthy();
  });
});
