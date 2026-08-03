import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ user: { role: 'RESIDENTE' }, logout: vi.fn() }));
vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: () => auth }));
import Sidebar from './Sidebar';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('menu por perfil e logout', () => {
  it('mostra somente entradas do residente', () => {
    render(<MemoryRouter><Sidebar open setOpen={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('Histórico')).toBeTruthy();
    expect(screen.queryByText('Aprovações')).toBeNull();
    expect(screen.queryByText('Criar formulário')).toBeNull();
  });
  it('encerra a sessão pelo botão sair', () => {
    render(<MemoryRouter><Sidebar open setOpen={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /sair/i }));
    expect(auth.logout).toHaveBeenCalledOnce();
  });
});
