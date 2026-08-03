import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
}));

vi.mock('../services/api', async (original) => ({
  ...(await original()),
  verifyEmail: api.verifyEmail,
}));

import VerifyEmailPage from './VerifyEmailPage';

function renderPage(query = '?token=valid-token-with-at-least-thirty-two-characters') {
  return render(
    <MemoryRouter initialEntries={[`/verify-email${query}`]}>
      <Routes><Route path="/verify-email" element={<VerifyEmailPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('confirmação de e-mail', () => {
  it('exibe estado acessível de carregamento e confirmação válida sem autenticar', async () => {
    let resolveVerification;
    api.verifyEmail.mockReturnValue(new Promise((resolve) => { resolveVerification = resolve; }));
    renderPage();
    expect(screen.getByRole('status').textContent).toMatch(/verificando seu e-mail/i);

    resolveVerification({ message: 'E-mail confirmado. Sua solicitação aguarda análise.' });
    expect(await screen.findByRole('heading', { name: /e-mail confirmado/i })).toBeTruthy();
    expect(screen.getByText(/aguarda análise/i)).toBeTruthy();
  });

  it.each([
    ['EXPIRED_TOKEN', /link expirado/i],
    ['INVALID_TOKEN', /link inválido/i],
    ['USED_TOKEN', /link já utilizado/i],
    [undefined, /não foi possível validar/i],
  ])('trata o estado %s', async (code, title) => {
    api.verifyEmail.mockRejectedValue({ code });
    renderPage();
    expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
  });

  it('oferece acesso ao reenvio em erro controlado', async () => {
    api.verifyEmail.mockRejectedValue({ code: 'EXPIRED_TOKEN' });
    renderPage();
    await screen.findByRole('heading', { name: /link expirado/i });
    expect(screen.getByRole('button', { name: /solicitar novo link/i })).toBeTruthy();
  });
});
