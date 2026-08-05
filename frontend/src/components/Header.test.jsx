import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { name: 'Admin Teste', role: 'ADMIN' } }),
}));

import Header from './Header';

afterEach(cleanup);

describe('ações do cabeçalho', () => {
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
