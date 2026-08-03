import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ clearSessionError: vi.fn(), login: vi.fn(), sessionError: '' }));
const api = vi.hoisted(() => ({ registerRequest: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/api', async (original) => ({ ...(await original()), registerRequest: api.registerRequest }));

import LoginPage from './LoginPage';
import RegisterRequestPage from './RegisterRequestPage';

beforeEach(() => { cleanup(); vi.clearAllMocks(); });

const fillRegistration = () => {
  fireEvent.change(screen.getByLabelText(/nome completo/i), { target: { value: 'Pessoa Teste' } });
  fireEvent.change(screen.getByLabelText(/^e-mail/i), { target: { value: 'pessoa@test.com' } });
  fireEvent.change(screen.getByLabelText(/^senha \*/i), { target: { value: 'Senha123' } });
  fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: 'Senha123' } });
  fireEvent.change(screen.getByLabelText(/cnpj/i), { target: { value: '11222333000181' } });
  fireEvent.change(screen.getByLabelText(/empresa ou startup/i), { target: { value: 'Startup' } });
  fireEvent.click(screen.getByLabelText(/li e aceito/i));
};

describe('páginas públicas de autenticação', () => {
  it('valida login antes de chamar a API', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(screen.getByText('Informe um e-mail válido.')).toBeTruthy();
    expect(screen.getByText('Informe sua senha.')).toBeTruthy();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('valida cadastro, aceite e confirmação de senha', () => {
    render(<MemoryRouter><RegisterRequestPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/^Senha \*/i), { target: { value: 'Senha123' } });
    fireEvent.change(screen.getByLabelText(/confirmar senha/i), { target: { value: 'Outra123' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));
    expect(screen.getByText('As senhas não coincidem.')).toBeTruthy();
    expect(screen.getByText('Aceite os termos para continuar.')).toBeTruthy();
  });

  it('informa que a confirmação foi enviada após o cadastro', async () => {
    api.registerRequest.mockResolvedValue({ status: 'EMAIL_PENDING' });
    render(<MemoryRouter><RegisterRequestPage /></MemoryRouter>);
    fillRegistration();
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));

    expect(await screen.findByRole('heading', { name: /confirme seu e-mail/i })).toBeTruthy();
    expect(screen.getByText(/enviamos uma mensagem para o seu e-mail/i)).toBeTruthy();
    expect(api.registerRequest).toHaveBeenCalledWith(expect.not.objectContaining({ role: expect.anything() }));
  });

  it('orienta o reenvio quando a solicitação foi criada mas o e-mail falhou', async () => {
    api.registerRequest.mockRejectedValue({
      status: 503,
      code: 'EMAIL_DELIVERY_FAILED',
      requestCreated: true,
      notificationSent: false,
    });
    render(<MemoryRouter><RegisterRequestPage /></MemoryRouter>);
    fillRegistration();
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));

    expect(await screen.findByRole('heading', { name: /solicitação criada/i })).toBeTruthy();
    expect(screen.getByText(/não faça um novo cadastro/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /reenviar confirmação/i })).toBeTruthy();
  });

  it('não sugere novo cadastro quando já existe uma solicitação', async () => {
    api.registerRequest.mockRejectedValue({
      status: 409,
      code: 'EXISTING_ACCESS_REQUEST',
      requestCreated: false,
    });
    render(<MemoryRouter><RegisterRequestPage /></MemoryRouter>);
    fillRegistration();
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));

    expect(await screen.findByRole('heading', { name: /solicitação já iniciada/i })).toBeTruthy();
    expect(screen.getByText(/não criamos uma solicitação duplicada/i)).toBeTruthy();
  });

  it('exibe a espera de um 429 e impede nova tentativa imediata', async () => {
    api.registerRequest.mockRejectedValue({
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfterSeconds: 60,
    });
    render(<MemoryRouter><RegisterRequestPage /></MemoryRouter>);
    fillRegistration();
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));

    expect(await screen.findByText(/aguarde 60 segundos/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /tente novamente em 60s/i }).disabled).toBe(true);
  });

  it('informa corretamente quando a solicitação aguarda aprovação', async () => {
    auth.login.mockRejectedValue({ code: 'APPROVAL_PENDING' });
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/^e-mail/i), { target: { value: 'pessoa@test.com' } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: 'Senha123' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByText('Seu e-mail foi confirmado e sua solicitação está aguardando análise.')).toBeTruthy();
  });
});
