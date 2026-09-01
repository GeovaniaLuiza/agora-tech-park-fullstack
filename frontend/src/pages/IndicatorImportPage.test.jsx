import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getInnovationCenters: vi.fn(), getIndicatorImportOptions: vi.fn(), getIndicatorImportDraft: vi.fn(),
  uploadIndicatorImport: vi.fn(), saveIndicatorImportReview: vi.fn(), groupImportedEvents: vi.fn(),
  confirmIndicatorImport: vi.fn(), getOfficialWorkbookStatus: vi.fn(), downloadOfficialIndicatorWorkbook: vi.fn(),
}));
vi.mock('../services/api.js', () => api);
import IndicatorImportPage from './IndicatorImportPage.jsx';

const eventItems = [{ id: 'event-2', sourceRows: [2], name: 'Evento Anônimo', location: 'Auditório', startAt: '2026-03-15T09:00:00.000Z', endAt: '2026-03-15T12:00:00.000Z', participants: null, theme: '', mode: '', subtype: '', participatingCompanies: null, included: false, reviewStatus: 'PENDING', possibleEvent: true, duplicateGroup: 'dup-1', grouped: false, participantStrategy: 'MANUAL', contracts: [] }];
const eventBatch = { id: 'batch-1', importType: 'EVENTS', status: 'WITH_WARNINGS', summary: { records: 1 }, warnings: [], draft: { items: eventItems } };
const residentItems = [{ id: 'resident-1', sourceRows: [4, 5, 6], name: 'Empresa Anônima', documentMasked: '11.***.***/0001-81', contracts: [{ sourceRow: 4, block: 'HUB', unit: 'HUB 201', startDate: '2026-01-01', endDate: null, eligibleBlock: true }], included: true, reviewStatus: 'VALIDATED', location: 'HUB', rooms: ['HUB 201'], contractType: 'Locada', startDate: '2026-01-01', endDate: null, sector: 'Tecnologia', status: 'ACTIVE', discontinuous: false }];
const residentBatch = { id: 'batch-2', importType: 'RESIDENTS', status: 'REVIEW_PENDING', summary: { records: 1, included: 1, monthly: Array(12).fill(1) }, warnings: [], draft: { items: residentItems } };

beforeEach(() => {
  vi.clearAllMocks();
  api.getInnovationCenters.mockResolvedValue([{ id: 'center-1', name: 'Centro de Inovação' }]);
  api.getIndicatorImportOptions.mockResolvedValue({ eventModes: ['PRESENTIAL', 'HYBRID', 'ONLINE', 'NOT_INFORMED'], eventTypes: ['Evento', 'Workshop'], maxBytes: 10485760 });
  api.getIndicatorImportDraft.mockResolvedValue(null);
  api.uploadIndicatorImport.mockResolvedValue(eventBatch);
  api.saveIndicatorImportReview.mockImplementation(async (_id, items) => ({ ...eventBatch, draft: { items } }));
});
afterEach(cleanup);

describe('telas de importação de indicadores', () => {
  it('não importa no upload: valida, mostra preview e salva a decisão humana', async () => {
    render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Centro de Inovação' });
    const file = new File(['xlsx'], 'estatisticas.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [file] } });
    expect(api.uploadIndicatorImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(await screen.findByText('Evento Anônimo')).toBeTruthy();
    expect(screen.getByText(/Possível mesmo evento/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar revisão/ }));
    await waitFor(() => expect(api.saveIndicatorImportReview).toHaveBeenCalledWith('batch-1', [expect.objectContaining({ included: true, reviewStatus: 'VALIDATED' })]));
  });

  it('exibe empresa consolidada, documento mascarado, contratos e preview mensal', async () => {
    api.uploadIndicatorImport.mockResolvedValueOnce(residentBatch);
    render(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Centro de Inovação' });
    const file = new File(['xlsx'], 'residentes.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(await screen.findByText('Empresa Anônima')).toBeTruthy();
    expect(screen.getByText('11.***.***/0001-81')).toBeTruthy();
    expect(screen.getByLabelText('Somente HUB / MOB / UNI').checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Ver contratos de Empresa Anônima/ }));
    expect(screen.getByText(/Linha 4/)).toBeTruthy();
    expect(screen.getByText('Preview mensal')).toBeTruthy();
  });

  it('pagina os resultados sem remover empresas do lote de importação', async () => {
    const residents = Array.from({ length: 21 }, (_, index) => ({
      ...residentItems[0], id: `resident-${index + 1}`, name: `Empresa ${String(index + 1).padStart(2, '0')}`,
    }));
    api.uploadIndicatorImport.mockResolvedValueOnce({ ...residentBatch, summary: { ...residentBatch.summary, records: 21, included: 21 }, draft: { items: residents } });
    render(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Centro de Inovação' });
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [new File(['x'], 'residentes.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(await screen.findByText('Empresa 01')).toBeTruthy();
    expect(screen.queryByText('Empresa 21')).toBeNull();
    expect(screen.getByText('Exibindo 1–20 de 21')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Empresa 21')).toBeTruthy();
    expect(screen.getByText('Exibindo 21–21 de 21')).toBeTruthy();
  });

  it('permite excluir, restaurar, agrupar e filtrar reservas revisadas', async () => {
    const items = [eventItems[0], { ...eventItems[0], id: 'event-3', sourceRows: [3], location: 'Rooftop', participants: 20 }];
    api.uploadIndicatorImport.mockResolvedValueOnce({ ...eventBatch, draft: { items } });
    api.groupImportedEvents.mockResolvedValueOnce({ ...eventBatch, draft: { items: [{ ...items[0], id: 'group-1', location: 'Auditório / Rooftop', grouped: true }] } });
    render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Centro de Inovação' });
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [new File(['x'], 'eventos.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findAllByText('Evento Anônimo');

    let selection = screen.getAllByRole('checkbox').filter((element) => !element.closest('label'));
    fireEvent.click(selection[0]); fireEvent.click(selection[1]);
    fireEvent.change(screen.getAllByPlaceholderText('Não informado')[0], { target: { value: '35' } });
    fireEvent.change(screen.getAllByPlaceholderText('Pendente')[0], { target: { value: 'Tecnologia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir dos indicadores' }));
    expect(screen.getAllByText('Excluído').length).toBeGreaterThan(0);

    selection = screen.getAllByRole('checkbox').filter((element) => !element.closest('label'));
    fireEvent.click(selection[0]); fireEvent.click(selection[1]);
    fireEvent.click(screen.getByRole('button', { name: /Restaurar/ }));
    selection = screen.getAllByRole('checkbox').filter((element) => !element.closest('label'));
    fireEvent.click(selection[0]); fireEvent.click(selection[1]);
    fireEvent.change(screen.getByDisplayValue('Participantes: informar manualmente'), { target: { value: 'MAX' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agrupar selecionados' }));
    await waitFor(() => expect(api.groupImportedEvents).toHaveBeenCalledWith('batch-1', expect.objectContaining({ participantStrategy: 'MAX' })));
    fireEvent.change(screen.getByPlaceholderText('Buscar evento'), { target: { value: 'inexistente' } });
    expect(screen.getByText('Nenhum registro corresponde aos filtros.')).toBeTruthy();
  });

  it('retoma draft, confirma e gera a planilha após escolher estratégia', async () => {
    const draft = { ...eventBatch, status: 'REVIEW_PENDING', draft: { items: [{ ...eventItems[0], included: true, reviewStatus: 'VALIDATED' }] } };
    api.getIndicatorImportDraft.mockResolvedValueOnce(draft);
    api.confirmIndicatorImport.mockResolvedValueOnce({ ...draft, status: 'IMPORTED' });
    api.getOfficialWorkbookStatus.mockResolvedValueOnce({ requiresStrategy: true, eventsOccupied: true, residentsOccupied: false });
    api.downloadOfficialIndicatorWorkbook.mockResolvedValueOnce({ blob: new Blob(['xlsx']), filename: 'indicadores_atualizado.xlsx' });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    expect(await screen.findByText('Evento Anônimo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    await screen.findByText(/Importação confirmada/);
    expect(screen.getByText('Indicadores atualizados').closest('li').className).toBe('done');
    expect(screen.getByText('Baixar XLSX').closest('li').className).toBe('active');
    fireEvent.click(screen.getByRole('button', { name: /Gerar Planilha de Indicadores/ }));
    await screen.findByRole('heading', { name: 'Gerar Planilha de Indicadores' });
    expect(screen.getByRole('button', { name: 'Gerar arquivo' }).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Substituir os blocos autorizados'));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar arquivo' }));
    await waitFor(() => expect(api.downloadOfficialIndicatorWorkbook).toHaveBeenCalledWith({ centerId: 'center-1', year: 2026, strategy: 'REPLACE' }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
    expect(screen.getByText('Baixar XLSX').closest('li').className).toBe('done');

    api.getOfficialWorkbookStatus.mockResolvedValueOnce({ requiresStrategy: true, eventsOccupied: true, residentsOccupied: false });
    api.downloadOfficialIndicatorWorkbook.mockRejectedValueOnce(new Error('O bloco de residentes excede a capacidade do template.'));
    fireEvent.click(screen.getByRole('button', { name: /Gerar Planilha de Indicadores/ }));
    await screen.findByRole('heading', { name: 'Gerar Planilha de Indicadores' });
    fireEvent.click(screen.getByLabelText('Mesclar com os dados existentes'));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar arquivo' }));
    expect((await screen.findByRole('alert')).textContent).toContain('excede a capacidade');
  });

  it('recalcula residentes quando contrato e campos manuais são revisados', async () => {
    api.uploadIndicatorImport.mockResolvedValueOnce(residentBatch);
    render(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Centro de Inovação' });
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [new File(['x'], 'residentes.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByText('Empresa Anônima');
    fireEvent.click(screen.getByRole('button', { name: /Ver contratos/ }));
    fireEvent.change(screen.getByLabelText('Saída'), { target: { value: '2026-02-15' } });
    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'Pendente de confirmação' } });
    fireEvent.change(screen.getByLabelText('Salas'), { target: { value: '201, 202' } });
    fireEvent.click(screen.getAllByLabelText(/Empresa Anônima/)[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Consolidar duplicidades' }));
    expect(screen.getByText(/Empresas já consolidadas/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Buscar empresa'), { target: { value: 'ausente' } });
    expect(screen.getByText('Nenhuma empresa corresponde aos filtros.')).toBeTruthy();
  });
});
