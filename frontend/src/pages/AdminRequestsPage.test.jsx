import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  approveAccessRequest: vi.fn(),
  getAccessRequests: vi.fn(),
  getOrganizations: vi.fn(),
  rejectAccessRequest: vi.fn(),
}));
vi.mock('../services/api', () => api);

import AdminRequestsPage from './AdminRequestsPage';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  api.getOrganizations.mockResolvedValue([]);
});

describe('painel de solicitações administrativas', () => {
  it('carrega em StrictMode sem retornar Promise como limpeza do efeito', async () => {
    api.getAccessRequests.mockResolvedValue([]);

    render(<StrictMode><AdminRequestsPage /></StrictMode>);

    await waitFor(() => expect(screen.getByText('Nenhuma solicitação pendente.')).toBeTruthy());
    expect(api.getAccessRequests).toHaveBeenCalled();
  });

  it('representa falha de carregamento sem remover a interface', async () => {
    api.getAccessRequests.mockRejectedValue(new Error('API indisponível'));

    render(<AdminRequestsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('API indisponível');
  });

  it('exige perfil e organização explícitos para aprovar residente', async () => {
    const request = {
      id: '1',
      name: 'Pessoa Teste',
      email: 'pessoa@test.com',
      requested_company_name: 'Startup',
      requested_company_cnpj: '11222333000181',
    };
    api.getAccessRequests.mockResolvedValue([request]);
    api.approveAccessRequest.mockResolvedValue({});
    render(<AdminRequestsPage />);
    await screen.findByText('Pessoa Teste');

    fireEvent.click(screen.getByRole('button', { name: /aprovar acesso/i }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Defina o perfil antes de aprovar.');

    fireEvent.change(screen.getByLabelText('Perfil de Pessoa Teste'), { target: { value: 'RESIDENTE' } });
    fireEvent.click(screen.getByRole('button', { name: /aprovar acesso/i }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Selecione ou crie uma organização para o residente.');

    fireEvent.change(screen.getByLabelText('Organização de Pessoa Teste'), { target: { value: '__create__' } });
    fireEvent.click(screen.getByRole('button', { name: /aprovar acesso/i }));
    await waitFor(() => expect(api.approveAccessRequest).toHaveBeenCalledWith('1', {
      role: 'RESIDENTE',
      createOrganization: true,
      organizationName: 'Startup',
    }));
  });
});
