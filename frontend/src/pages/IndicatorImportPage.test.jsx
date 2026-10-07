import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const openReview = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Preview' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revisão' }));
};

describe('telas de importação de indicadores', () => {
  it('não importa no upload: valida, mostra preview e salva a decisão humana', async () => {
    render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Centro de Inovação' });
    const file = new File(['xlsx'], 'estatisticas.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [file] } });
    expect(api.uploadIndicatorImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await openReview();
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
    await openReview();
    expect(await screen.findByText('Empresa Anônima')).toBeTruthy();
    expect(screen.getByText('11.***.***/0001-81')).toBeTruthy();
    expect(screen.getByLabelText('Somente HUB / MOB / UNI').checked).toBe(false);
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
    await openReview();
    expect(await screen.findByText('Empresa 01')).toBeTruthy();
    expect(screen.queryByText('Empresa 21')).toBeNull();
    expect(screen.getByText('Exibindo 1–20 de 21')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Empresa 21')).toBeTruthy();
    expect(screen.getByText('Exibindo 21–21 de 21')).toBeTruthy();
  });

  it.each([2, 3])('exclui logicamente dois dos %i eventos e restaura após salvar a revisão', async (total) => {
    const items = Array.from({ length: total }, (_, index) => ({
      ...eventItems[0], id: `event-${index + 2}`, sourceRows: [index + 2], name: `Evento ${index + 1}`,
      included: true, reviewStatus: 'VALIDATED', validationStatus: 'VALID', duplicateGroup: null, issues: [],
    }));
    api.getIndicatorImportDraft.mockResolvedValueOnce({ ...eventBatch, year: 2026, draft: { items } });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    // O servidor retorna IGNORED nos registros excluídos ao salvar o draft.
    api.saveIndicatorImportReview.mockImplementation(async (_id, reviewed) => ({
      ...eventBatch, year: 2026, draft: { items: reviewed.map((item) => ({
        ...item, validationStatus: item.reviewStatus === 'EXCLUDED' ? 'IGNORED' : 'VALID',
      })) },
    }));
    render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    await screen.findByText('Evento 1');
    const rows = () => items.map((item) => screen.getByText(item.name).closest('tr'));
    const selectTwo = () => rows().slice(0, 2).forEach((row) => fireEvent.click(within(row).getByRole('checkbox')));
    const assertRows = (excluded) => rows().forEach((row, index) => {
      const isExcluded = excluded && index < 2;
      expect(within(row).getByRole('button', { name: isExcluded ? 'Não' : 'Sim' }).className).toContain('active');
      expect(within(row).getByText(isExcluded ? 'Ignorado' : 'Válido')).toBeTruthy();
      expect(within(row).getByRole('checkbox').checked).toBe(false);
    });
    const monthly = () => screen.getByRole('heading', { name: 'Preview mensal' }).closest('section');
    expect(within(monthly()).getByText('Mar').parentElement.querySelector('strong').textContent).toBe(String(total));
    selectTwo();
    expect(screen.getByText('2 selecionado(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir dos indicadores' }));
    assertRows(true);
    expect(screen.getByText('0 selecionado(s)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Excluir dos indicadores' }).disabled).toBe(true);
    expect(within(monthly()).getByText('Mar').parentElement.querySelector('strong').textContent).toBe(String(total - 2));
    fireEvent.click(screen.getByRole('button', { name: /Salvar revisão/ }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith('batch-1', items.map((item, index) => expect.objectContaining({
      id: item.id, included: index >= 2, reviewStatus: index < 2 ? 'EXCLUDED' : 'VALIDATED',
    })));
    assertRows(true);
    selectTwo();
    fireEvent.click(screen.getByRole('button', { name: /Restaurar/ }));
    assertRows(false);
    expect(screen.getByText('0 selecionado(s)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Restaurar/ }).disabled).toBe(true);
    expect(within(monthly()).getByText('Mar').parentElement.querySelector('strong').textContent).toBe(String(total));
    fireEvent.click(screen.getByRole('button', { name: /Salvar revisão/ }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith('batch-1', items.map((item) => expect.objectContaining({
      id: item.id, included: true, reviewStatus: 'VALIDATED',
    })));
    assertRows(false);
  });

  it('permite excluir, restaurar, agrupar e filtrar reservas revisadas', async () => {
    const items = [eventItems[0], { ...eventItems[0], id: 'event-3', sourceRows: [3], location: 'Rooftop', participants: 20 }];
    api.uploadIndicatorImport.mockResolvedValueOnce({ ...eventBatch, draft: { items } });
    api.groupImportedEvents.mockResolvedValueOnce({ ...eventBatch, draft: { items: [{ ...items[0], id: 'group-1', location: 'Auditório / Rooftop', grouped: true }] } });
    render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Centro de Inovação' });
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [new File(['x'], 'eventos.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await openReview();
    await screen.findAllByText('Evento Anônimo');

    let selection = screen.getAllByRole('checkbox').filter((element) => !element.closest('label'));
    fireEvent.click(selection[0]); fireEvent.click(selection[1]);
    fireEvent.change(screen.getByLabelText('Participantes da linha 2'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('Temática da linha 2'), { target: { value: 'Tecnologia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir dos indicadores' }));
    expect(screen.getAllByText('Ignorado').length).toBeGreaterThan(0);

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
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para confirmação' }));
    expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
    expect(screen.getByText('Resumo final')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    await screen.findByText(/Importação confirmada/);
    expect(screen.getAllByText('Indicadores atualizados').find((element) => element.closest('li')).closest('li').className).toBe('active');
    expect(screen.getByText('Baixar XLSX').closest('li').className).toBe('');
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
    await openReview();
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


it('mostra orientação exata e percorre validação, preview e revisão sem confirmar', async () => {
  api.uploadIndicatorImport.mockResolvedValueOnce({ ...eventBatch, sheetName: 'Eventos', fileSize: 4096, year: 2026, summary: { records: 1, rowsRead: 1 }, draft: { items: [{ ...eventItems[0], validationStatus: 'VALID' }] } });
  render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
  expect(screen.getByText('Campos principais')).toBeTruthy();
  expect(screen.getByText('Lista · Data · Local')).toBeTruthy();
  expect(screen.getByText(/Cabeçalho: linha 1/)).toBeTruthy();
  expect(screen.getByText(/Nº de Empresas Participantes/)).toBeTruthy();
  await screen.findByRole('option', { name: 'Centro de Inovação' });
  fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [new File(['xlsx'], 'Eventos.xlsx')] } });
  expect(screen.getByText('Eventos.xlsx')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
  await screen.findByRole('button', { name: 'Preview' });
  expect(screen.getByText('Registros encontrados')).toBeTruthy();
  expect(screen.getByText('Válidos')).toBeTruthy();
  expect(screen.getByText('Com aviso')).toBeTruthy();
  expect(screen.getByText(/Aba detectada: Eventos/)).toBeTruthy();
  expect(screen.queryByText('Evento Anônimo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  expect(screen.getByLabelText('Temática da linha 2').disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Revisão' }));
  expect(screen.getByLabelText('Temática da linha 2').disabled).toBe(false);
  expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
});
it('mostra preview consolidado, áreas, revisão por ocupação e ignorados', async () => {
  const occupations = [
    { sourceRow: 3, block: 'HUB', unit: 'Sala 201', area: 55.4, areaInput: '55,40', eligibleBlock: true, startInput: '2026-01-01', endInput: '30/04/20257', startDate: '2026-01-01', endDate: null },
    { sourceRow: 4, block: 'HUB', unit: 'Sala 202', area: 60, areaInput: '60', eligibleBlock: true },
    { sourceRow: 5, block: 'UNI', unit: 'Sala 103', area: 70, areaInput: '70', eligibleBlock: true },
  ];
  const company = { ...residentItems[0], document: '', documentFormatted: 'Não informado', totalArea: 185.4, contracts: occupations, sourceRows: [3, 4, 5], validationStatus: 'REVIEW_REQUIRED', issues: [{ message: 'CNPJ ausente na linha 3' }, { message: 'Data inválida (Fim) na linha 3' }] };
  const ignored = { ...residentItems[0], id: 'ignored-6', name: 'Disponível', included: false, ignored: true, validationStatus: 'IGNORED', reviewStatus: 'EXCLUDED', sourceRows: [6] };
  const loaded = { ...residentBatch, sheetName: 'Clientes', year: 2026, summary: { rowsRead: 4, companies: 1, uniqueCnpjs: 0, occupations: 3, ignored: 1 }, draft: { items: [company, ignored] } };
  api.uploadIndicatorImport.mockResolvedValueOnce(loaded);
  api.saveIndicatorImportReview.mockImplementationOnce(async (_id, items) => ({ ...loaded, draft: { items } }));
  render(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
  expect(screen.getByText(/Cabeçalho: linha 2/)).toBeTruthy();
  expect(screen.getByText(/Bloco e Modúlo/)).toBeTruthy();
  expect(screen.getByText(/Múltiplas salas\/módulos serão preservadas/)).toBeTruthy();
  await screen.findByRole('option', { name: 'Centro de Inovação' });
  fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [new File(['xlsx'], 'Clientes.xlsx')] } });
  fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
  await openReview();
  expect(screen.getByText('3 ocupações · Área total: 185,40 m²')).toBeTruthy();
  expect(screen.getByText('CNPJ ausente na linha 3')).toBeTruthy();
  expect(screen.getByText('Data inválida (Fim) na linha 3')).toBeTruthy();
  expect(screen.getAllByText('Ignorado').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: /Ver contratos de Empresa Anônima/ }));
  expect(screen.getByText(/HUB — Sala 201 — 55,40 m²/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: '11.222.333/0001-81' } });
  fireEvent.change(screen.getByLabelText('endInput da linha 3'), { target: { value: '30/04/2027' } });
  fireEvent.change(screen.getByLabelText('areaInput da linha 3'), { target: { value: '56,40' } });
  fireEvent.click(screen.getByRole('button', { name: /Salvar revisão/ }));
  await waitFor(() => expect(api.saveIndicatorImportReview).toHaveBeenCalledWith('batch-2', [
    expect.objectContaining({ document: '11.222.333/0001-81', contracts: expect.arrayContaining([expect.objectContaining({ endInput: '30/04/2027', areaInput: '56,40' })]) }),
    expect.objectContaining({ ignored: true, included: false }),
  ]));
  expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
});

it('mostra resumo de empresas e ocupações antes da confirmação de residentes', async () => {
  const draft = { ...residentBatch, year: 2026, summary: { records: 1, included: 1, excluded: 0, processed: 1 } };
  api.getIndicatorImportDraft.mockResolvedValueOnce(draft);
  api.confirmIndicatorImport.mockResolvedValueOnce({ ...draft, status: 'IMPORTED' });
  vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
  render(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
  await screen.findByText('Empresa Anônima');
  fireEvent.click(screen.getByRole('button', { name: 'Continuar para confirmação' }));
  expect(screen.getByText(/1 empresas serão importadas\/atualizadas · 1 ocupações serão vinculadas · 0 registros serão ignorados/)).toBeTruthy();
  expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
  await screen.findByText('Importação concluída');
  expect(api.confirmIndicatorImport).toHaveBeenCalledWith('batch-2');
  expect(screen.getByText(/Registros processados: 1/)).toBeTruthy();
});
