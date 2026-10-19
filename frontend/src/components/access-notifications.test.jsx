import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getNotifications: vi.fn(), markNotificationRead: vi.fn(), getAccessRequest: vi.fn(),
  getAccessRequests: vi.fn(), getOrganizations: vi.fn(),
  approveAccessRequest: vi.fn(), rejectAccessRequest: vi.fn(),
}));
vi.mock('../services/api.js', () => api);
vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: () => ({ user: { name: 'Admin', role: 'ADMIN' } }) }));
import Header from './Header';
import AdminRequestsPage from '../pages/AdminRequestsPage';

const requests = ['44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555'].map((id, index) => ({
  id, name: 'Mesmo Nome', email: `pessoa${index}@test.com`, requested_company_name: `Empresa ${index}`,
  requested_company_cnpj: '11222333000181',
}));
const notifications = requests.map((item, index) => ({
  id: `notification-${index}`, title: 'Nova solicitação de acesso',
  message: `${item.name} confirmou o e-mail e aguarda análise.`,
  link: `/admin/solicitacoes?requestId=${item.id}`, read_at: null, created_at: '2026-10-14T12:00:00Z',
}));
function Location() { const location = useLocation(); return <output aria-label="Rota">{location.pathname}{location.search}</output>; }
function renderFlow(initialEntry = '/') {
  return render(<MemoryRouter initialEntries={[initialEntry]}>
    <Header title="Painel" subtitle="Teste" setOpen={vi.fn()} /><Location />
    <Routes><Route path="/" element={<p>Início</p>} /><Route path="/admin/solicitacoes" element={<AdminRequestsPage />} /></Routes>
  </MemoryRouter>);
}
beforeEach(() => {
  vi.resetAllMocks();
  api.getNotifications.mockResolvedValue(notifications);
  api.markNotificationRead.mockImplementation(async (id) => ({ ...notifications.find((item) => item.id === id), read_at: '2026-10-14T13:00:00Z' }));
  api.getAccessRequest.mockImplementation(async (id) => requests.find((item) => item.id === id));
  api.getAccessRequests.mockResolvedValue([{ id: 'other', name: 'Outra Pessoa', email: 'outra@test.com' }]);
  api.getOrganizations.mockResolvedValue([]);
});
afterEach(cleanup);

describe('notificações de solicitações de acesso', () => {
  it.each([0, 1])('abre a solicitação correta do card %i apesar de nomes iguais e ausência na listagem', async (index) => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    const cards = await screen.findAllByRole('button', { name: /Nova solicitação de acesso/ });
    expect(cards[index].textContent).toContain('confirmou o e-mail e aguarda análise.');
    await user.click(cards[index]);
    await waitFor(() => expect(api.getAccessRequest).toHaveBeenCalledWith(requests[index].id));
    expect(screen.getByLabelText('Rota').textContent).toBe(notifications[index].link);
    const selected = await screen.findByLabelText('Solicitação de Mesmo Nome');
    expect(selected.textContent).toContain(requests[index].email);
    expect(selected.classList.contains('selected-request')).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(selected));
    expect(screen.queryByText(requests[1 - index].email)).toBeNull();
    expect(screen.getByText('Outra Pessoa')).toBeTruthy();
    expect(api.markNotificationRead).toHaveBeenCalledExactlyOnceWith(notifications[index].id);
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    const reopened = screen.getAllByRole('button', { name: /Nova solicitação de acesso/ });
    expect(reopened[index].classList.contains('unread')).toBe(false);
    expect(reopened[1 - index].classList.contains('unread')).toBe(true);
  });

  it.each(['{Enter}', ' '])('permite ativar todo o card pelo teclado: %s', async (key) => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    await screen.findAllByRole('button', { name: /Nova solicitação de acesso/ });
    await user.tab();
    expect(document.activeElement.textContent).toContain('Nova solicitação de acesso');
    await user.keyboard(key);
    expect(await screen.findByLabelText('Solicitação de Mesmo Nome')).toBeTruthy();
    expect(api.markNotificationRead).toHaveBeenCalledExactlyOnceWith('notification-0');
  });

  it('mantém o acesso geral sem seleção ou marcação de leitura', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    await user.click(screen.getByRole('button', { name: 'Ver solicitações de acesso' }));
    expect(await screen.findByText('Outra Pessoa')).toBeTruthy();
    expect(screen.getByLabelText('Rota').textContent).toBe('/admin/solicitacoes');
    expect(api.getAccessRequest).not.toHaveBeenCalled();
    expect(api.markNotificationRead).not.toHaveBeenCalled();
    expect(document.querySelector('.selected-request')).toBeNull();
  });

  it.each([403, 404, 410])('trata solicitação indisponível (%i) mantendo a tela geral', async (status) => {
    api.getAccessRequest.mockRejectedValue(Object.assign(new Error('Indisponível'), { status }));
    renderFlow(notifications[0].link);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Esta solicitação não está mais disponível.');
    expect(screen.getByText('Outra Pessoa')).toBeTruthy();
    expect(screen.queryByText(requests[0].email)).toBeNull();
    expect(document.querySelector('.selected-request')).toBeNull();
  });

  it('continua navegando se a marcação de leitura falhar', async () => {
    api.markNotificationRead.mockRejectedValue(new Error('Falha de leitura'));
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    await user.click((await screen.findAllByRole('button', { name: /Nova solicitação de acesso/ }))[0]);
    expect(await screen.findByLabelText('Solicitação de Mesmo Nome')).toBeTruthy();
    expect(screen.getByLabelText('Rota').textContent).toBe(notifications[0].link);
    expect(screen.queryByLabelText('Painel de notificações')).toBeNull();
  });

  it.each(['resolve', 'reject'])('carrega a solicitação com leitura pendente e mantém a URL após %s', async (outcome) => {
    let resolveRead;
    let rejectRead;
    api.markNotificationRead.mockReturnValue(new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; }));
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    await user.click((await screen.findAllByRole('button', { name: /Nova solicitação de acesso/ }))[0]);
    expect(screen.getByLabelText('Rota').textContent).toBe(notifications[0].link);
    expect(screen.queryByLabelText('Painel de notificações')).toBeNull();
    expect(await screen.findByLabelText('Solicitação de Mesmo Nome')).toBeTruthy();
    expect(api.getAccessRequest).toHaveBeenCalledExactlyOnceWith(requests[0].id);

    await act(async () => {
      if (outcome === 'resolve') resolveRead({ ...notifications[0], read_at: '2026-10-19T12:00:00Z' });
      else rejectRead(new Error('Falha de leitura'));
    });
    expect(screen.getByLabelText('Rota').textContent).toBe(notifications[0].link);
    expect(screen.getByLabelText('Solicitação de Mesmo Nome').textContent).toContain(requests[0].email);
    expect(screen.queryByLabelText('Painel de notificações')).toBeNull();
  });

  it('não marca novamente uma notificação já lida', async () => {
    api.getNotifications.mockResolvedValue([{ ...notifications[0], read_at: '2026-10-14T13:00:00Z' }]);
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    await user.click(await screen.findByRole('button', { name: /Nova solicitação de acesso/ }));
    expect(await screen.findByLabelText('Solicitação de Mesmo Nome')).toBeTruthy();
    expect(api.markNotificationRead).not.toHaveBeenCalled();
  });
});
