import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  createIndicatorDefinition: vi.fn(),
  deleteIndicatorDefinition: vi.fn(),
  getIndicatorDefinitions: vi.fn(),
  updateIndicatorDefinition: vi.fn(),
}));
vi.mock('../services/api.js', () => api);
import IndicatorCatalogPage from './IndicatorCatalogPage.jsx';

const indicator = {
  id: 'indicator-1', code: 'EVENTOS_REALIZADOS', name: 'Eventos realizados', description: '',
  category: 'Eventos', unit: 'UNIDADE', value_type: 'INTEGER', periodicity: 'MONTHLY',
  aggregation_type: 'SUM', annual_aggregation: 'SUM', sort_order: 1, active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getIndicatorDefinitions.mockResolvedValue([indicator]);
  api.createIndicatorDefinition.mockResolvedValue({});
  api.updateIndicatorDefinition.mockResolvedValue({});
  api.deleteIndicatorDefinition.mockResolvedValue({});
});
afterEach(cleanup);

describe('catálogo de indicadores', () => {
  it('lista, pesquisa, ordena, cria, edita e exclui definições', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<IndicatorCatalogPage />);
    expect(await screen.findByText('Eventos realizados')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'ausente' } });
    expect(screen.getByText('Nenhum indicador encontrado.')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Categoria/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Novo indicador' }));
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'TESTE_NOVO' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Indicador teste' } });
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Testes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar indicador' }));
    await waitFor(() => expect(api.createIndicatorDefinition).toHaveBeenCalledWith(expect.objectContaining({ code: 'TESTE_NOVO', name: 'Indicador teste' })));

    fireEvent.click(screen.getByRole('button', { name: 'Editar Eventos realizados' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Eventos confirmados' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar indicador' }));
    await waitFor(() => expect(api.updateIndicatorDefinition).toHaveBeenCalledWith('indicator-1', expect.objectContaining({ name: 'Eventos confirmados' })));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Eventos realizados' }));
    await waitFor(() => expect(api.deleteIndicatorDefinition).toHaveBeenCalledWith('indicator-1'));
  });
});
