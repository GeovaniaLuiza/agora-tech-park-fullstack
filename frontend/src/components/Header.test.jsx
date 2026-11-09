import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { name: 'Admin Teste', role: 'ADMIN' } }),
}));
vi.mock('../services/api.js', () => ({
  getNotifications: vi.fn().mockResolvedValue([]),
  markNotificationRead: vi.fn(),
}));

import Header from './Header';
import { getNotifications, markNotificationRead } from '../services/api.js';

function Location({ onLocation }) {
  const { pathname, search, hash } = useLocation();
  const url = `${pathname}${search}${hash}`;
  useEffect(() => { onLocation(url); }, [onLocation, url]);
  return <output aria-label="URL">{url}</output>;
}

function renderNotifications(onLocation = vi.fn()) {
  render(<MemoryRouter>
    <Header title="Painel" subtitle="Teste" setOpen={vi.fn()} />
    <Location onLocation={onLocation} />
  </MemoryRouter>);
  return onLocation;
}

beforeEach(() => {
  vi.resetAllMocks();
  getNotifications.mockResolvedValue([]);
});

afterEach(cleanup);

describe('ações do cabeçalho', () => {
  it.each(['resolve', 'reject'])('preserva a URL completa antes e depois do PATCH lento: %s', async (outcome) => {
    const notification = { id: 'notification-123', title: 'Nova solicitação de acesso', message: 'Pessoa aguarda análise.', link: '/admin/solicitacoes?requestId=req-123', read_at: null };
    getNotifications.mockResolvedValue([notification]);
    let resolveRead;
    let rejectRead;
    markNotificationRead.mockReturnValue(new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; }));
    const user = userEvent.setup();
    const onLocation = renderNotifications();
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    const card = await screen.findByRole('button', { name: /Nova solicitação de acesso/ });
    const general = screen.getByRole('button', { name: 'Ver solicitações de acesso' });
    expect(card.parentElement).toBe(general.parentElement);
    expect(card.contains(general)).toBe(false);
    expect(general.contains(card)).toBe(false);
    // Clicar no conteúdo também deve ativar somente o card.
    await user.click(card.querySelector('span'));
    expect(markNotificationRead).toHaveBeenCalledExactlyOnceWith(notification.id);
    expect(screen.getByLabelText('URL').textContent).toBe(notification.link);
    expect(screen.queryByLabelText('Painel de notificações')).toBeNull();
    expect(onLocation.mock.calls.map(([url]) => url)).toEqual(['/', notification.link]);

    await act(async () => {
      if (outcome === 'resolve') resolveRead({ ...notification, read_at: '2026-10-19T12:00:00Z' });
      else rejectRead(new Error('Falha no PATCH'));
    });
    expect(screen.getByLabelText('URL').textContent).toBe(notification.link);
    expect(onLocation.mock.calls.map(([url]) => url)).toEqual(['/', notification.link]);
    expect(screen.queryByLabelText('Painel de notificações')).toBeNull();
  });

  it.each([
    '/admin/solicitacoes',
    '/admin/solicitacoes?requestId=req-123',
    '/admin/solicitacoes?requestId=req%2F123&source=notification#details',
  ])('navega exatamente para %s mesmo quando o PATCH falha', async (link) => {
    getNotifications.mockResolvedValue([{ id: 'notification', title: 'Nova solicitação de acesso', message: 'Aguardando análise', link }]);
    markNotificationRead.mockRejectedValue(new Error('Falha no PATCH'));
    const user = userEvent.setup();
    const onLocation = renderNotifications();
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    await user.click(await screen.findByRole('button', { name: /Nova solicitação de acesso/ }));
    expect(screen.getByLabelText('URL').textContent).toBe(link);
    expect(onLocation.mock.calls.map(([url]) => url)).toEqual(['/', link]);
    expect(screen.queryByLabelText('Painel de notificações')).toBeNull();
  });

  it('o botão geral navega sem query mesmo com cards individuais presentes', async () => {
    getNotifications.mockResolvedValue([{ id: 'notification', title: 'Nova solicitação de acesso', link: '/admin/solicitacoes?requestId=req-123' }]);
    const user = userEvent.setup();
    const onLocation = renderNotifications();
    await user.click(screen.getByRole('button', { name: 'Notificações' }));
    await screen.findByRole('button', { name: /Nova solicitação de acesso/ });
    await user.click(screen.getByRole('button', { name: 'Ver solicitações de acesso' }));
    expect(screen.getByLabelText('URL').textContent).toBe('/admin/solicitacoes');
    expect(onLocation.mock.calls.map(([url]) => url)).toEqual(['/', '/admin/solicitacoes']);
    expect(markNotificationRead).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Painel de notificações')).toBeNull();
  });

  it('abre o painel de notificações e navega para solicitações', () => {
    render(<MemoryRouter><Routes><Route path="/" element={<Header title="Painel" subtitle="Teste" setOpen={vi.fn()} />} /><Route path="/admin/solicitacoes" element={<h1>Solicitações</h1>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Notificações' }));
    expect(screen.getByLabelText('Painel de notificações')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver solicitações de acesso' }));
    expect(screen.getByRole('heading', { name: 'Solicitações' })).toBeTruthy();
  });

  it('abre a página de perfil', () => {
    render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<Header title="Painel" subtitle="Teste" setOpen={vi.fn()} />} /><Route path="/perfil" element={<h1>Meu perfil</h1>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir meu perfil' }));
    expect(screen.getByRole('heading', { name: 'Meu perfil' })).toBeTruthy();
  });
});
