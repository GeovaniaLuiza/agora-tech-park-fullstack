import { MAX_IMPORT_BYTES } from '../config/indicatorImport.js';
import { residentHomologationWorkbookFixture, eventHomologationWorkbookFixture } from '../../../backend/tests/fixtures/indicator-import-workbooks.js';
import { parseResidentWorkbook, summarizeResidents } from '../../../backend/src/services/residentImportParser.js';
import { parseEventWorkbook, summarizeEvents } from '../../../backend/src/services/eventImportParser.js';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
  vi.resetAllMocks();
  api.getInnovationCenters.mockResolvedValue([{ id: 'center-1', name: 'Centro de Inovação' }]);
  api.getIndicatorImportOptions.mockResolvedValue({ eventModes: ['PRESENTIAL', 'HYBRID', 'ONLINE', 'NOT_INFORMED'], eventTypes: ['Evento', 'Workshop'], maxBytes: MAX_IMPORT_BYTES });
  api.getIndicatorImportDraft.mockResolvedValue(null);
  api.uploadIndicatorImport.mockResolvedValue(eventBatch);
  api.saveIndicatorImportReview.mockImplementation(async (_id, items) => ({ ...eventBatch, draft: { items } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const openReview = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Preview' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revisão' }));
};

it('Eventos.xlsx real: inclui 192 válidos e 43 avisos, salva, retoma e confirma os 235', async () => {
  const parsed = await parseEventWorkbook(await eventHomologationWorkbookFixture());
  let saved = { ...eventBatch, year: 2026, fileName: 'Eventos.xlsx', summary: parsed.summary, draft: { items: parsed.items } };
  api.getIndicatorImportDraft.mockImplementation(async () => structuredClone(saved));
  api.saveIndicatorImportReview.mockImplementation(async (_id, items) => {
    saved = { ...saved, summary: summarizeEvents(items, 2026), draft: { items: structuredClone(items) } };
    return structuredClone(saved);
  });
  api.confirmIndicatorImport.mockResolvedValue({ ...saved, status: 'IMPORTED', summary: { processed: 235, indicatorsUpdated: true } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const card = label => screen.getByText(label, { selector: 'small' }).closest('article').querySelector('strong').textContent;
  const renderPage = () => render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
  const view = renderPage();
  await screen.findByRole('button', { name: 'Salvar revisão' });
  for (const [label, value] of [['Registros encontrados', 235], ['Válidos', 192], ['Com aviso', 43], ['Revisão necessária', 0], ['Ignorados', 0], ['Incluídos', 0]]) expect(card(label)).toBe(String(value));
  const decisions = within(screen.getByRole('region', { name: 'Decisões da revisão' }));
  expect(decisions.getByRole('button', { name: 'Ignorar registros incorretos' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(true);
  fireEvent.click(decisions.getByRole('button', { name: 'Incluir elegíveis' }));
  expect(card('Incluídos')).toBe('235');
  expect(card('Com aviso')).toBe('43');
  expect(card('Inválidos ainda incluídos / pendentes')).toBe('0');
  expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
  await screen.findByText('Revisão salva com sucesso.');
  expect(saved.draft.items.filter(item => item.included)).toHaveLength(235);
  expect(saved.draft.items.filter(item => item.validationStatus === 'WARNING')).toHaveLength(43);
  view.unmount();
  renderPage();
  await screen.findByRole('button', { name: 'Salvar revisão' });
  expect(card('Incluídos')).toBe('235');
  expect(card('Com aviso')).toBe('43');
  fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
  expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
  api.confirmIndicatorImport.mockResolvedValueOnce({ ...saved, status: 'IMPORTED', summary: { ...saved.summary, processed: 235, indicatorsUpdated: true } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
  await screen.findByText('Importação concluída');
  expect(api.confirmIndicatorImport).toHaveBeenCalledExactlyOnceWith(saved.id);
  expect(screen.getByText('Importação confirmada e indicadores atualizados.')).toBeTruthy();
  expect(screen.getByText('Indicadores atualizados', { selector: 'small' }).closest('li').classList.contains('active')).toBe(true);
}, 15000);

it.each(['EVENTS', 'RESIDENTS'])('Incluir elegíveis preserva aviso não bloqueante e não inclui erro obrigatório em %s', async type => {
  const base = type === 'EVENTS' ? eventItems[0] : residentItems[0];
  const items = [
    { ...base, id: 'warning', included: false, reviewStatus: 'PENDING', validationStatus: 'WARNING', issues: [{ message: 'Aviso não bloqueante' }] },
    { ...base, id: 'error', included: false, reviewStatus: 'PENDING', validationStatus: 'REVIEW_REQUIRED', issues: [{ message: 'Erro obrigatório' }] },
  ];
  const batch = { ...(type === 'EVENTS' ? eventBatch : residentBatch), draft: { items } };
  api.getIndicatorImportDraft.mockResolvedValue(batch);
  api.saveIndicatorImportReview.mockImplementation(async (_id, reviewed) => ({ ...batch, draft: { items: reviewed } }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Incluir elegíveis' }));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
  await screen.findByText('Revisão salva com sucesso.');
  expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith(batch.id, [
    expect.objectContaining({ id: 'warning', included: true, validationStatus: 'WARNING', issues: items[0].issues }),
    items[1],
  ]);
});

it.each(['EVENTS', 'RESIDENTS'])('Ignorar registro usa o ID exato quando dois registros têm o mesmo nome em %s', async type => {
  const base = type === 'EVENTS' ? eventItems[0] : residentItems[0];
  const items = [3, 4].map(row => ({ ...base, id: `exact-${row}`, sourceRows: [row], name: 'Nome repetido',
    included: true, validationStatus: 'VALID', reviewStatus: 'VALIDATED', issues: [] }));
  const batch = { ...(type === 'EVENTS' ? eventBatch : residentBatch), draft: { items } };
  api.getIndicatorImportDraft.mockResolvedValue(batch);
  api.saveIndicatorImportReview.mockImplementation(async (_id, reviewed) => ({ ...batch, draft: { items: reviewed } }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
  await screen.findByRole('button', { name: 'Salvar revisão' });
  const rows = screen.getAllByText('Nome repetido', { selector: 'strong' }).map(element => element.closest('tr'));
  fireEvent.click(within(rows[1]).getByRole('button', { name: 'Ignorar registro' }));
  expect(within(rows[1]).getByText('Ignorado')).toBeTruthy();
  expect(within(rows[0]).getByText('Válido')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
  await screen.findByText('Revisão salva com sucesso.');
  expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith(batch.id, [items[0],
    { ...items[1], included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED' }]);
});

it('Clientes.xlsx real: salva e retoma a revisão, ignora 20 inválidos e conclui com 65 válidos incluídos', async () => {
  const parsed = await parseResidentWorkbook(await residentHomologationWorkbookFixture());
  let saved = { ...residentBatch, year: 2026, fileName: 'Clientes.xlsx', summary: parsed.summary, draft: { items: parsed.items } };
  api.getIndicatorImportDraft.mockImplementation(async () => structuredClone(saved));
  api.saveIndicatorImportReview.mockImplementation(async (_id, items) => {
    saved = { ...saved, status: 'VALIDATED', summary: summarizeResidents(items, 2026), draft: { items: structuredClone(items) } };
    return structuredClone(saved);
  });
  api.confirmIndicatorImport.mockImplementation(async () => ({ ...saved, status: 'IMPORTED', summary: { ...saved.summary, processed: 65, indicatorsUpdated: true } }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const card = (label) => screen.getByText(label, { selector: 'small' }).closest('article').querySelector('strong').textContent;
  const renderPage = () => render(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
  const view = renderPage();
  await screen.findByRole('button', { name: 'Salvar revisão' });
  for (const [label, count] of [['Linhas lidas', 163], ['Empresas identificadas', 85], ['CNPJs únicos', 72], ['Ocupações', 121], ['Válidos', 65], ['Avisos', 0], ['Incluídos', 85], ['Ignorados', 42], ['Inválidos ainda incluídos / pendentes', 20]]) expect(card(label)).toBe(String(count));
  expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(true);
  expect(screen.getByText(/A confirmação está bloqueada por 20 registros inválidos/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
  await screen.findByText('Revisão salva com sucesso.');
  expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Ignorar registros incorretos' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Ignorar 20 registros inválidos?' })).getByRole('button', { name: 'Ignorar registros' }));
  expect(card('Incluídos')).toBe('65');
  expect(card('Ignorados')).toBe('62');
  expect(card('Inválidos ainda incluídos / pendentes')).toBe('0');
  expect(screen.queryByText(/A confirmação está bloqueada/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
  await screen.findByText('Revisão salva com sucesso.');
  expect(saved.draft.items).toHaveLength(127);
  expect(saved.draft.items.filter((item) => item.included)).toEqual(parsed.items.filter((item) => item.validationStatus === 'VALID'));
  expect(saved.draft.items.filter((item) => !item.included && !item.ignored && item.reviewStatus !== 'EXCLUDED')).toEqual([]);
  for (const [label, count] of [['Linhas lidas', 163], ['Empresas identificadas', 85], ['CNPJs únicos', 72], ['Ocupações', 121]]) expect(card(label)).toBe(String(count));
  expect(saved.draft.items.filter(item => item.issues.length)).toEqual(parsed.items.filter(item => item.issues.length).map(item => ({ ...item, included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED' })));
  view.unmount();
  renderPage();
  await screen.findByRole('button', { name: 'Salvar revisão' });
  expect(card('Incluídos')).toBe('65');
  expect(card('Ignorados')).toBe('62');
  for (const [label, count] of [['Linhas lidas', 163], ['Empresas identificadas', 85], ['CNPJs únicos', 72], ['Ocupações', 121]]) expect(card(label)).toBe(String(count));
  expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
  expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
  expect(screen.getByText(/65 empresas serão importadas\/atualizadas · 101 ocupações serão vinculadas · 62 registros serão ignorados/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
  await screen.findByText('Importação concluída');
  expect(api.confirmIndicatorImport).toHaveBeenCalledExactlyOnceWith(saved.id);
  expect(screen.getByText('Importação confirmada e indicadores atualizados.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ver indicadores de residentes' }).getAttribute('href')).toBe('/indicadores/residentes?centerId=center-1&year=2026');
}, 15000);

describe.each(['EVENTS', 'RESIDENTS'])('ignorar bloqueantes na etapa 5 de %s', (type) => {
  const card = (label) => screen.getByText(label, { selector: 'small' }).closest('article').querySelector('strong').textContent;
  async function finalReview(count, withValid = true, fixture = {}) {
    const base = type === 'EVENTS' ? eventBatch : residentBatch;
    const invalid = Array.from({ length: count }, (_, index) => ({
      ...base.draft.items[0], id: `invalid-${index}`, name: `Inconsistente ${index}`, sourceRows: [index + 3],
      document: '', included: true, reviewStatus: 'VALIDATED', validationStatus: 'VALID', issues: [],
    }));
    const issues = invalid.map((item) => ({ itemId: item.id, message: `${type === 'RESIDENTS' ? 'CNPJ ausente' : 'Data inválida'} na linha ${item.sourceRows[0]}` }));
    const valid = { ...base.draft.items[0], id: 'valid', name: 'Registro válido', sourceRows: [9], included: true, reviewStatus: 'VALIDATED', validationStatus: 'VALID', issues: [] };
    const warning = { ...valid, id: 'warning', name: 'Registro com aviso', sourceRows: [10], validationStatus: 'WARNING', reviewStatus: 'WITH_WARNINGS', issues: [{ message: 'Aviso não bloqueante' }] };
    const undecided = { ...valid, id: 'undecided', name: 'Sem decisão', sourceRows: [11], included: false, validationStatus: 'REVIEW_REQUIRED', reviewStatus: 'PENDING', issues: [{ message: 'Erro em registro sem decisão' }] };
    let saved = { ...base, summary: fixture.summary || base.summary, fileName: fixture.fileName,
      draft: { items: [...invalid, ...(withValid ? fixture.items || [valid, warning, undecided] : [])] } };
    api.getIndicatorImportDraft.mockImplementation(async () => saved);
    api.saveIndicatorImportReview.mockImplementation(async (_id, reviewed) => {
      saved = { ...saved, draft: { items: structuredClone(reviewed) } };
      return saved;
    });
    api.confirmIndicatorImport.mockRejectedValueOnce(Object.assign(new Error(`${issues[0].message}. Corrija ou ignore o registro antes de confirmar.`), { code: 'REVIEW_REQUIRED', issues }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let view;
    await act(async () => { view = render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>); });
    await screen.findByRole('button', { name: 'Salvar revisão' });
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    await screen.findByRole('alert');
    return { view, invalid, issues, getSaved: () => saved };
  }

  it('passa de 85 para 84 incluídos sem alterar os demais registros na homologação', async () => {
    const base = type === 'RESIDENTS' ? residentItems[0] : eventItems[0];
    const remaining = Array.from({ length: 84 }, (_, index) => ({
      ...base, id: `included-${index}`, name: `Registro ${index}`, sourceRows: [index + 4], included: true,
      validationStatus: index < 65 ? 'VALID' : 'WARNING', reviewStatus: index < 65 ? 'VALIDATED' : 'WITH_WARNINGS',
      issues: index < 65 ? [] : [{ message: 'Aviso não bloqueante' }],
    }));
    const fixture = { fileName: type === 'RESIDENTS' ? 'Clientes.xlsx' : 'Eventos.xlsx', items: remaining,
      summary: { rowsRead: 163, companies: 85, uniqueCnpjs: 72, occupations: 121, records: 85 } };
    const { view, issues, getSaved } = await finalReview(1, true, fixture);
    const checkSourceCounts = () => {
      if (type !== 'RESIDENTS') return;
      for (const [label, value] of [['Linhas lidas', 163], ['Empresas identificadas', 85], ['CNPJs únicos', 72], ['Ocupações', 121]]) {
        expect(card(label)).toBe(String(value));
      }
    };
    checkSourceCounts();
    expect(card('Válidos')).toBe('65');
    expect(card('Incluídos')).toBe('85');
    expect(card('Inválidos ainda incluídos / pendentes')).toBe('1');
    const final = screen.getByRole('region', { name: 'Confirmação final da importação' });
    expect(within(final).getByRole('alert').textContent).toBe(`${issues[0].message}. Corrija ou ignore o registro antes de confirmar.`);
    fireEvent.click(within(final).getByRole('button', { name: 'Ignorar registro' }));
    await waitFor(() => expect(within(final).getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(false));
    expect(card('Incluídos')).toBe('84');
    expect(card('Ignorados')).toBe('1');
    expect(card('Inválidos ainda incluídos / pendentes')).toBe('0');
    checkSourceCounts();
    expect(api.saveIndicatorImportReview).toHaveBeenCalledExactlyOnceWith(getSaved().id, getSaved().draft.items);
    expect(getSaved().draft.items).toHaveLength(85);
    expect(getSaved().draft.items[0]).toMatchObject({ included: false, document: '', issues: [issues[0]] });
    expect(getSaved().draft.items.slice(1)).toEqual(remaining);
    expect(within(screen.getByRole('region', { name: 'Registros ignorados' })).getByText(issues[0].message)).toBeTruthy();
    view.unmount();
    await act(async () => { render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>); });
    expect(card('Incluídos')).toBe('84');
    expect(card('Ignorados')).toBe('1');
    checkSourceCounts();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    api.confirmIndicatorImport.mockResolvedValueOnce({ ...getSaved(), status: 'IMPORTED' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    await screen.findByText('Importação concluída');
  });

  it.each([[1, 'individual'], [2, 'individual'], [2, 'lote']])('ignora %i inválido(s) por ação %s, persiste e libera confirmação', async (count, action) => {
    const { view, issues, getSaved } = await finalReview(count);
    const region = () => screen.getByRole('region', { name: 'Confirmação final da importação' });
    expect(within(region()).getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(true);
    expect(card('Inválidos ainda incluídos / pendentes')).toBe(String(count));
    if (count === 1) expect(within(region()).queryByRole('button', { name: 'Ignorar registros incorretos' })).toBeNull();
    if (action === 'individual') {
      for (let index = count - 1; index >= 0; index--) {
        const group = within(region()).getByRole('group', { name: `Registro da linha ${index + 3}` });
        expect(within(group).getByText(issues[index].message)).toBeTruthy();
        fireEvent.click(within(group).getByRole('button', { name: 'Ignorar registro' }));
        await waitFor(() => expect(getSaved().draft.items[index].included).toBe(false));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar revisão' }).disabled).toBe(false));
        expect(card('Inválidos ainda incluídos / pendentes')).toBe(String(index));
        if (index > 0) {
          expect(getSaved().draft.items[0].included).toBe(true);
          expect(within(region()).getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(true);
        }
      }
    } else {
      fireEvent.click(within(region()).getByRole('button', { name: 'Ignorar registros incorretos' }));
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Ignorar 2 registros inválidos?' })).getByRole('button', { name: 'Ignorar registros' }));
    }
    await waitFor(() => expect(within(region()).getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(false));
    expect(card('Incluídos')).toBe('2');
    expect(card('Ignorados')).toBe(String(count));
    expect(card('Inválidos ainda incluídos / pendentes')).toBe('0');
    expect(screen.queryByRole('alert')).toBeNull();
    for (let index = 0; index < count; index++) {
      const item = getSaved().draft.items[index];
      expect(item).toMatchObject({ included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED', document: '', issues: [issues[index]] });
      const ignored = within(screen.getByRole('region', { name: 'Registros ignorados' })).getByRole('group', { name: `Registro da linha ${index + 3}` });
      expect(within(ignored).getByText('Ignorado')).toBeTruthy();
      expect(within(ignored).getByText(issues[index].message)).toBeTruthy();
    }
    expect(getSaved().draft.items.find((item) => item.id === 'warning')).toMatchObject({ included: true, validationStatus: 'WARNING' });
    expect(getSaved().draft.items.find((item) => item.id === 'undecided')).toMatchObject({ included: false, reviewStatus: 'PENDING', validationStatus: 'REVIEW_REQUIRED' });
    view.unmount();
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Salvar revisão' });
    expect(card('Ignorados')).toBe(String(count));
    expect(card('Inválidos ainda incluídos / pendentes')).toBe('0');
    expect(screen.getAllByText('Ignorado', { selector: 'span' })).toHaveLength(count);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    api.confirmIndicatorImport.mockResolvedValueOnce({ ...getSaved(), status: 'IMPORTED' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    await screen.findByText('Importação concluída');
    expect(api.confirmIndicatorImport).toHaveBeenCalledTimes(2);
  });

  it('mantém o bloqueio e o registro incluído quando a persistência falha', async () => {
    const { getSaved } = await finalReview(1);
    api.saveIndicatorImportReview.mockRejectedValueOnce(new Error('Falha ao salvar revisão.'));
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar registro' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Falha ao salvar revisão.');
    expect(getSaved().draft.items[0].included).toBe(true);
    expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Ignorar registro' }).disabled).toBe(false);
  });

  it('continua impedindo confirmar quando todos os incluídos foram ignorados', async () => {
    await finalReview(1, false);
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar registro' }));
    await screen.findByRole('region', { name: 'Registros ignorados' });
    expect(card('Incluídos')).toBe('0');
    expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(true);
  });
});

describe.each(['EVENTS', 'RESIDENTS'])('navegação e execução da confirmação final de %s', (type) => {
  async function savedReview(included = true) {
    const base = type === 'EVENTS' ? eventBatch : residentBatch;
    const batch = { ...base, status: 'VALIDATED', year: 2026, draft: { items: Array.from({ length: 235 }, (_, index) => ({
      ...base.draft.items[0], id: `record-${index}`, sourceRows: [index + 2], included,
      reviewStatus: 'VALIDATED', validationStatus: index < 192 ? 'VALID' : 'WARNING', issues: [],
      duplicateGroup: index < 192 ? null : 'duplicate',
    })) } };
    api.confirmIndicatorImport.mockReset();
    api.saveIndicatorImportReview.mockResolvedValue(batch);
    api.getIndicatorImportDraft.mockResolvedValueOnce(batch);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar revisão' }));
    await screen.findByText('Revisão salva com sucesso.');
    return batch;
  }

  it('avança de 4 para 5 sem POST e executa a API somente pelo botão final, com 235 incluídos', async () => {
    const batch = await savedReview();
    expect(screen.getByText('0 selecionado(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    const finalActions = screen.getByRole('region', { name: 'Confirmação final da importação' });
    const finalButton = within(finalActions).getByRole('button', { name: 'Confirmar importação' });
    expect(finalButton.disabled).toBe(false);
    expect(document.activeElement).toBe(finalButton);
    expect(finalActions.compareDocumentPosition(screen.getByText('Formato esperado')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Confirmar importação' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(true);
    expect(screen.getByText(/235 registros serão importados|235 empresas serão importadas/)).toBeTruthy();
    expect(screen.getByText('Válidos', { selector: 'small' }).closest('article').querySelector('strong').textContent).toBe('192');
    expect(screen.getByText(type === 'EVENTS' ? 'Com aviso' : 'Avisos', { selector: 'small' }).closest('article').querySelector('strong').textContent).toBe('43');
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
    api.confirmIndicatorImport.mockResolvedValueOnce({ ...batch, status: 'IMPORTED' });
    fireEvent.click(finalButton);
    await screen.findByText('Importação concluída');
    expect(api.confirmIndicatorImport).toHaveBeenCalledExactlyOnceWith(batch.id);
    expect(screen.getByText('Importado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar importação' })).toBeNull();
  });

  it('mostra erro da API, mantém a etapa 5 e permite tentar novamente', async () => {
    const batch = await savedReview();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para confirmação' }));
    api.confirmIndicatorImport.mockRejectedValueOnce(new Error('Não foi possível confirmar este lote.'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível confirmar este lote.');
    expect(within(screen.getByRole('region', { name: 'Confirmação final da importação' })).getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Importado')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(false);
    api.confirmIndicatorImport.mockResolvedValueOnce({ ...batch, status: 'IMPORTED' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    await screen.findByText('Importação concluída');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('desabilita o botão final sem incluídos mesmo com registros selecionados', async () => {
    await savedReview(false);
    fireEvent.click(within(screen.getAllByRole('row')[1]).getAllByRole('checkbox')[0]);
    expect(screen.getByText('1 selecionado(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Confirmar importação' })).toBeNull();
    expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
  });
});

describe('inclusão explícita e confirmação da revisão', () => {
  const card = (label) => screen.getByText(label, { selector: 'small' }).closest('article').querySelector('strong').textContent;
  const restore = async (batch) => {
    api.getIndicatorImportDraft.mockResolvedValueOnce(batch);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render(<MemoryRouter><IndicatorImportPage type={batch.importType} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Salvar revisão' });
    return view;
  };

  it.each(['EVENTS', 'RESIDENTS'].flatMap((type) => ['upload', 'draft'].map((entry) => [type, entry])))('inclui 192 válidos e 43 avisos, salva, restaura e confirma %s via %s', async (type, entry) => {
    const base = type === 'EVENTS' ? eventBatch : residentBatch;
    const items = Array.from({ length: 235 }, (_, index) => ({
      ...base.draft.items[0], id: `record-${index}`, sourceRows: [index + 2], name: `Registro ${index}`,
      included: type === 'RESIDENTS', reviewStatus: type === 'EVENTS' ? 'PENDING' : index < 192 ? 'VALIDATED' : 'WITH_WARNINGS',
      validationStatus: index < 192 ? 'VALID' : 'WARNING', issues: [], duplicateGroup: index < 192 ? null : 'dup-1',
      discontinuous: type === 'RESIDENTS' && index >= 192,
    }));
    let saved = { ...base, fileName: type === 'EVENTS' ? 'Eventos.xlsx' : 'Clientes.xlsx', fileSize: 15_759,
      summary: { rowsRead: 235 }, draft: { items } };
    api.saveIndicatorImportReview.mockImplementation(async (_id, reviewed) => {
      saved = { ...saved, draft: { items: reviewed.map((item) => ({ ...item })) } };
      return saved;
    });
    let view;
    if (entry === 'draft') view = await restore(saved);
    else {
      api.uploadIndicatorImport.mockResolvedValueOnce(saved);
      view = render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
      await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
      fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [new File([new Uint8Array(15_759)], saved.fileName)] } });
      fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
      await screen.findByText('Arquivo validado. Revise os registros antes de confirmar.');
      await openReview();
    }
    expect(screen.getByText(/Tamanho: 15,4 KB/)).toBeTruthy();
    expect(card('Válidos')).toBe('192');
    expect(card(type === 'EVENTS' ? 'Com aviso' : 'Avisos')).toBe('43');
    expect(card('Revisão necessária')).toBe('0');
    expect(card('Ignorados')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(screen.getByRole('button', { name: 'Continuar para confirmação' }).disabled).toBe(type === 'EVENTS');
    if (type === 'EVENTS') {
      // The action includes eligible records across all pages and filters.
      fireEvent.change(screen.getByPlaceholderText('Buscar evento'), { target: { value: 'Registro 0' } });
      fireEvent.click(screen.getByRole('button', { name: 'Incluir elegíveis' }));
      expect(screen.getByText(/235 incluído\(s\) nos indicadores · 0 sem decisão/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
      await screen.findByText('Revisão salva com sucesso.');
    }
    expect(saved.draft.items.filter((item) => item.included)).toHaveLength(235);
    expect(card('Válidos')).toBe('192');
    expect(card(type === 'EVENTS' ? 'Com aviso' : 'Avisos')).toBe('43');
    view.unmount();
    await restore(saved);
    expect(screen.getByText('0 selecionado(s)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar para confirmação' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para confirmação' }));
    expect(screen.getByText(type === 'EVENTS' ? /235 registros serão importados · 0 serão ignorados/ : /235 empresas serão importadas\/atualizadas/)).toBeTruthy();
    expect(screen.getByText('0 registros sem decisão não serão importados.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(false);
    api.confirmIndicatorImport.mockResolvedValueOnce({ ...saved, status: 'IMPORTED' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    await screen.findByText('Importação confirmada e indicadores atualizados.');
    expect(api.confirmIndicatorImport).toHaveBeenCalledWith(saved.id);
  }, 15_000);

  it.each(['EVENTS', 'RESIDENTS'])('distingue seleção, inclusão, exclusão e falta de decisão em %s', async (type) => {
    const base = type === 'EVENTS' ? eventBatch : residentBatch;
    const items = Array.from({ length: 4 }, (_, index) => ({
      ...base.draft.items[0], id: `record-${index}`, name: `Registro ${index}`, sourceRows: [index + 2],
      included: false, reviewStatus: index === 1 ? 'EXCLUDED' : 'PENDING',
      validationStatus: index === 1 ? 'IGNORED' : index === 3 ? 'REVIEW_REQUIRED' : 'VALID',
      issues: index === 3 ? [{ message: 'Campo obrigatório ausente' }] : [], duplicateGroup: null,
    }));
    const batch = { ...base, summary: { rowsRead: 4 }, draft: { items } };
    api.saveIndicatorImportReview.mockImplementation(async (_id, reviewed) => ({ ...batch, draft: { items: reviewed } }));
    await restore(batch);
    const firstRow = screen.getByText('Registro 0').closest('tr');
    fireEvent.click(within(firstRow).getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(screen.getByText('1 selecionado(s)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar para confirmação' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Confirmar importação' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Incluir selecionados' }));
    expect(screen.getByText(/1 incluído\(s\) nos indicadores · 2 sem decisão/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Incluir elegíveis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith(batch.id, expect.arrayContaining([
      expect.objectContaining({ id: 'record-0', included: true }),
      expect.objectContaining({ id: 'record-1', included: false, reviewStatus: 'EXCLUDED' }),
      expect.objectContaining({ id: 'record-2', included: true }),
      expect.objectContaining({ id: 'record-3', included: false, validationStatus: 'REVIEW_REQUIRED' }),
    ]));
    expect(card('Ignorados')).toBe('1');
    expect(screen.getByRole('button', { name: 'Continuar para confirmação' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para confirmação' }));
    expect(screen.getByText('1 registros sem decisão não serão importados.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar importação' }).disabled).toBe(false);
  });
});

describe('recuperação de erros e respostas tardias da importação', () => {
  const readyBatch = (type) => {
    const base = type === 'EVENTS' ? eventBatch : residentBatch;
    return { ...base, draft: { items: base.draft.items.map((item) => ({ ...item, included: true, reviewStatus: 'VALIDATED' })) } };
  };
  const requestMessage = 'Os dados da revisão excedem o limite da requisição.';

  it.each(['EVENTS', 'RESIDENTS'])('preserva erro de JSON ao avançar e limpa após salvar novamente em %s', async (type) => {
    const batch = readyBatch(type);
    api.getIndicatorImportDraft.mockResolvedValueOnce(batch);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.saveIndicatorImportReview.mockRejectedValueOnce(Object.assign(new Error(requestMessage), { code: 'IMPORT_REQUEST_TOO_LARGE' }))
      .mockResolvedValueOnce(batch);
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar revisão' }));
    expect((await screen.findByRole('alert')).textContent).toBe(requestMessage);
    expect(screen.getByRole('alert').textContent).not.toContain('A planilha excede');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para confirmação' }));
    await screen.findByText('Resumo final');
    expect(screen.getByRole('alert').textContent).toBe(requestMessage);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith(batch.id, batch.draft.items);
    expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
  });

  it.each(['EVENTS', 'RESIDENTS'])('não avança para confirmar se a revisão alterada falha em %s', async (type) => {
    const batch = readyBatch(type);
    batch.draft.items.push({ ...batch.draft.items[0], id: 'other-valid', name: 'Outro registro válido' });
    api.getIndicatorImportDraft.mockResolvedValueOnce(batch);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.saveIndicatorImportReview.mockRejectedValueOnce(new Error(requestMessage));
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Salvar revisão' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Ignorar registro' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    expect((await screen.findByRole('alert')).textContent).toBe(requestMessage);
    expect(screen.queryByText('Resumo final')).toBeNull();
    expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
    expect(api.saveIndicatorImportReview).toHaveBeenCalledOnce();
  });

  const lateCases = ['EVENTS', 'RESIDENTS'].flatMap((type) => ['upload', 'save', 'confirm'].flatMap((operation) =>
    ['success', 'failure'].map((outcome) => [type, operation, outcome])));
  it.each(lateCases)('descarta resposta de %s/%s/%s após sair da tela', async (type, operation, outcome) => {
    const batch = readyBatch(type);
    const method = { upload: 'uploadIndicatorImport', save: 'saveIndicatorImportReview', confirm: 'confirmIndicatorImport' }[operation];
    let resolveRequest, rejectRequest;
    api[method].mockReturnValueOnce(new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; }));
    if (operation !== 'upload') api.getIndicatorImportDraft.mockResolvedValueOnce(batch);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    if (operation === 'upload') {
      await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
      fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [new File(['xlsx'], 'import.xlsx')] } });
      fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    } else {
      await screen.findByRole('button', { name: 'Salvar revisão' });
      if (operation === 'confirm') {
        fireEvent.click(screen.getByRole('button', { name: 'Continuar para confirmação' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
      } else fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    }
    expect(api[method]).toHaveBeenCalledOnce();
    view.unmount();
    const nextType = type === 'EVENTS' ? 'RESIDENTS' : 'EVENTS';
    render(<MemoryRouter><IndicatorImportPage type={nextType} /></MemoryRouter>);
    await waitFor(() => expect(api.getIndicatorImportDraft).toHaveBeenLastCalledWith(nextType, 'center-1'));
    await act(async () => {
      if (outcome === 'failure') rejectRequest(new Error(requestMessage));
      else resolveRequest(operation === 'confirm' ? { ...batch, status: 'IMPORTED' } : batch);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Importação concluída')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salvar revisão' })).toBeNull();
    expect(api[method]).toHaveBeenCalledOnce();
  });

  const loadSelectedEvents = async () => {
    const batch = readyBatch('EVENTS');
    batch.draft.items.push({ ...batch.draft.items[0], id: 'event-3', sourceRows: [3] });
    api.getIndicatorImportDraft.mockResolvedValueOnce(batch);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Salvar revisão' });
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    return { view, batch };
  };

  it('interrompe agrupamento quando salvar a revisão alterada falha', async () => {
    await loadSelectedEvents();
    fireEvent.change(screen.getByLabelText('Temática da linha 2'), { target: { value: 'Tecnologia' } });
    api.saveIndicatorImportReview.mockRejectedValueOnce(new Error(requestMessage));
    fireEvent.click(screen.getByRole('button', { name: 'Agrupar selecionados' }));
    expect((await screen.findByRole('alert')).textContent).toBe(requestMessage);
    expect(api.groupImportedEvents).not.toHaveBeenCalled();
  });

  it('remove erro do agrupamento depois de uma nova tentativa válida', async () => {
    const { batch } = await loadSelectedEvents();
    api.groupImportedEvents.mockRejectedValueOnce(new Error(requestMessage)).mockResolvedValueOnce(batch);
    fireEvent.click(screen.getByRole('button', { name: 'Agrupar selecionados' }));
    expect((await screen.findByRole('alert')).textContent).toBe(requestMessage);
    fireEvent.click(screen.getByRole('button', { name: 'Agrupar selecionados' }));
    await screen.findByText('Reservas agrupadas em um único evento.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Agrupar selecionados' }).disabled).toBe(true);
    expect(api.groupImportedEvents).toHaveBeenCalledTimes(2);
  });

  it.each(['success', 'failure'])('descarta agrupamento tardio com %s após sair da tela', async (outcome) => {
    const { view, batch } = await loadSelectedEvents();
    let resolveRequest, rejectRequest;
    api.groupImportedEvents.mockReturnValueOnce(new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; }));
    fireEvent.click(screen.getByRole('button', { name: 'Agrupar selecionados' }));
    expect(api.groupImportedEvents).toHaveBeenCalledOnce();
    view.unmount();
    render(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
    await waitFor(() => expect(api.getIndicatorImportDraft).toHaveBeenLastCalledWith('RESIDENTS', 'center-1'));
    await act(async () => outcome === 'success' ? resolveRequest(batch) : rejectRequest(new Error(requestMessage)));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salvar revisão' })).toBeNull();
  });
});

describe('telas de importação de indicadores', () => {
  it.each(['EVENTS', 'RESIDENTS'])('não exibe erros legados do draft após upload válido e reload em %s', async (type) => {
    const message = 'A planilha excede o limite de 200 MB.';
    const original = type === 'EVENTS' ? eventBatch : residentBatch;
    const base = { ...original, draft: { items: original.draft.items.map((item) => ({ ...item, included: true, reviewStatus: 'VALIDATED', validationStatus: 'VALID' })) } };
    const oldDraft = { ...base, fileSize: 15_759, draft: { ...base.draft,
      error: message, importError: message, validationError: message } };
    api.getIndicatorImportDraft.mockResolvedValueOnce(oldDraft);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.uploadIndicatorImport.mockResolvedValueOnce({ ...base, fileSize: 15_759 });
    const view = render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar revisão' })).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
    // A failed save of a pristine draft previously left this error on Confirmar.
    api.saveIndicatorImportReview.mockRejectedValueOnce(new Error(message));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    const file = new File([new Uint8Array(15_759)], type === 'EVENTS' ? 'Eventos.xlsx' : 'Clientes.xlsx');
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [file] } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByText('Arquivo validado. Revise os registros antes de confirmar.');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    await screen.findByText('Resumo final');
    expect(screen.queryByRole('alert')).toBeNull();
    // Even an old response still containing legacy JSON fields cannot restore an alert.
    view.unmount();
    api.getIndicatorImportDraft.mockResolvedValueOnce(oldDraft);
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Salvar revisão' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/Tamanho: 15,4 KB/)).toBeTruthy();
  });

  it.each(['EVENTS', 'RESIDENTS'])('limpa erro antigo de revisão ao avançar draft válido para Confirmar em %s', async (type) => {
    const base = type === 'EVENTS' ? eventBatch : residentBatch;
    api.getIndicatorImportDraft.mockResolvedValueOnce({ ...base, draft: { items: base.draft.items.map((item) => ({ ...item, included: true, reviewStatus: 'VALIDATED', validationStatus: 'VALID' })) } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.saveIndicatorImportReview.mockRejectedValueOnce(new Error('A planilha excede o limite de 200 MB.'));
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar revisão' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    await screen.findByText('Resumo final');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['EVENTS', 'RESIDENTS'])('limpa erro local quando a recuperação seguinte retorna draft válido em %s', async (type) => {
    api.getInnovationCenters.mockResolvedValueOnce([{ id: 'center-1', name: 'Centro 1' }, { id: 'center-2', name: 'Centro 2' }]);
    api.getIndicatorImportDraft.mockRejectedValueOnce(new Error('A planilha excede o limite de 200 MB.'));
    api.getIndicatorImportDraft.mockResolvedValueOnce(type === 'EVENTS' ? eventBatch : residentBatch);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'center-2' } });
    await screen.findByRole('button', { name: 'Salvar revisão' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['EVENTS', 'RESIDENTS'])('descarta erro tardio de rascunho após selecionar e validar arquivo de %s', async (type) => {
    let rejectDraft;
    api.getIndicatorImportDraft.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectDraft = reject; }));
    api.uploadIndicatorImport.mockResolvedValueOnce(type === 'EVENTS' ? eventBatch : residentBatch);
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(api.getIndicatorImportDraft).toHaveBeenCalledWith(type, 'center-1'));
    const file = new File([new Uint8Array(15_759)], type === 'EVENTS' ? 'Eventos.xlsx' : 'Clientes.xlsx');
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [file] } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByText('Arquivo validado. Revise os registros antes de confirmar.');
    await act(async () => rejectDraft(new Error('A planilha excede o limite de 200 MB.')));
    expect(screen.getByText(/Tamanho: 15,4 KB/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Arquivo validado. Revise os registros antes de confirmar.');
  });

  it.each(['EVENTS', 'RESIDENTS'])('descarta erro tardio de rascunho antes da validação de %s', async (type) => {
    let rejectDraft;
    api.getIndicatorImportDraft.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectDraft = reject; }));
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(api.getIndicatorImportDraft).toHaveBeenCalledWith(type, 'center-1'));
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [new File(['xlsx'], 'dados.xlsx')] } });
    await act(async () => rejectDraft(new Error('A planilha excede o limite de 200 MB.')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Validar' }).disabled).toBe(false);
    expect(api.uploadIndicatorImport).not.toHaveBeenCalled();
  });

  it.each(['EVENTS', 'RESIDENTS'])('mostra erro de recuperação de rascunho sem arquivo selecionado em %s', async (type) => {
    api.getIndicatorImportDraft.mockRejectedValueOnce(new Error('Falha ao recuperar rascunho.'));
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    expect((await screen.findByRole('alert')).textContent).toBe('Falha ao recuperar rascunho.');
  });

  it.each(['EVENTS', 'RESIDENTS'])('limpa o erro de tamanho anterior ao selecionar 15759 bytes em %s', async (type) => {
    api.uploadIndicatorImport.mockResolvedValueOnce(type === 'EVENTS' ? eventBatch : residentBatch);
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
    expect(MAX_IMPORT_BYTES).toBe(209_715_200);
    const oversized = new File(['xlsx'], 'grande.xlsx');
    Object.defineProperty(oversized, 'size', { value: MAX_IMPORT_BYTES + 1 });
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [oversized] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('A planilha excede o limite de 200 MB.');
    const file = new File([new Uint8Array(15_759)], 'planilha.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(file.size).toBe(15_759);
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [file] } });
    expect(screen.getByText(/Tamanho: 15,4 KB/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Validar' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByText('Arquivo validado. Revise os registros antes de confirmar.');
    expect(api.uploadIndicatorImport).toHaveBeenCalledWith(type, 'center-1', file, false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['EVENTS', 200], ['EVENTS', '200'], ['RESIDENTS', 200], ['RESIDENTS', '200'],
  ])('usa 209715200 bytes em %s mesmo se as opções retornam %s', async (type, maxBytes) => {
    api.getIndicatorImportOptions.mockResolvedValueOnce({ eventModes: [], eventTypes: [], maxBytes });
    api.uploadIndicatorImport.mockResolvedValueOnce(type === 'EVENTS' ? eventBatch : residentBatch);
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
    expect(screen.getByText(/Formato: XLSX · Limite: 200 MB/)).toBeTruthy();
    const file = new File([new Uint8Array(15_759)], 'planilha.xlsx');
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByText('Arquivo validado. Revise os registros antes de confirmar.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['EVENTS', 'RESIDENTS'])('limpa erro de limite do backend antes de tentar novamente em %s', async (type) => {
    api.uploadIndicatorImport.mockRejectedValueOnce(Object.assign(new Error('A planilha excede o limite de 200 MB.'), { code: 'PAYLOAD_TOO_LARGE' }));
    let resolveUpload;
    api.uploadIndicatorImport.mockReturnValueOnce(new Promise((resolve) => { resolveUpload = resolve; }));
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
    const file = new File([new Uint8Array(15_759)], 'planilha.xlsx');
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => resolveUpload(type === 'EVENTS' ? eventBatch : residentBatch));
    await screen.findByText('Arquivo validado. Revise os registros antes de confirmar.');
  });

  it.each(['EVENTS', 'RESIDENTS'])('normaliza erro legado do backend e limpa ao selecionar arquivo válido em %s', async (type) => {
    // Simulates a cached response from the previous upload limit.
    const previousLimit = MAX_IMPORT_BYTES / 4 / 1024 / 1024;
    api.uploadIndicatorImport.mockRejectedValueOnce(Object.assign(new Error(`A planilha excede o limite de ${previousLimit} MB.`), { code: 'PAYLOAD_TOO_LARGE' }));
    api.uploadIndicatorImport.mockResolvedValueOnce(type === 'EVENTS' ? eventBatch : residentBatch);
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
    const chooseFile = () => fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [new File(['xlsx'], 'dados.xlsx')] } });
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('A planilha excede o limite de 200 MB.');
    chooseFile();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByText('Arquivo validado. Revise os registros antes de confirmar.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['EVENTS', 'RESIDENTS'])('preserva outros erros ao selecionar novo arquivo em %s', async (type) => {
    api.uploadIndicatorImport.mockRejectedValueOnce(new Error('A planilha possui colunas inválidas.'));
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [new File(['xlsx'], 'invalida.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [new File([new Uint8Array(15_759)], 'planilha.xlsx')] } });
    expect(screen.getByRole('alert').textContent).toBe('A planilha possui colunas inválidas.');
  });

  it.each(['EVENTS', 'RESIDENTS'])('mostra 200 MB e bloqueia arquivo acima do limite antes do upload de %s', async (type) => {
    const { container } = render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
    expect(screen.getByText(/Formato: XLSX · Limite: 200 MB/)).toBeTruthy();
    expect(screen.getByText(/Somente XLSX · limite de 200 MB/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/\b(?:50|100) MB\b/);
    const file = new File(['xlsx'], 'planilha.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES + 1 });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('A planilha excede o limite de 200 MB.');
    expect(api.uploadIndicatorImport).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/\b(?:50|100) MB\b/);
  });

  it.each([
    ['EVENTS', 15_759], ['RESIDENTS', 15_759],
    ['EVENTS', MAX_IMPORT_BYTES - 1], ['EVENTS', MAX_IMPORT_BYTES],
    ['RESIDENTS', MAX_IMPORT_BYTES - 1], ['RESIDENTS', MAX_IMPORT_BYTES],
  ])('permite validar arquivo de %s com %i bytes', async (type, size) => {
    api.uploadIndicatorImport.mockResolvedValueOnce(type === 'EVENTS' ? eventBatch : residentBatch);
    const { container } = render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
    const file = new File(['xlsx'], 'planilha.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    Object.defineProperty(file, 'size', { value: size });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByText('Arquivo validado. Revise os registros antes de confirmar.');
    expect(api.uploadIndicatorImport).toHaveBeenCalledWith(type, 'center-1', file, false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('exibe erro se o reprocessamento autorizado falha sem repetir a confirmação', async () => {
    const duplicate = Object.assign(new Error('Este arquivo já foi processado.'), { code: 'IMPORT_ALREADY_EXISTS' });
    api.uploadIndicatorImport.mockRejectedValueOnce(duplicate).mockRejectedValueOnce(duplicate);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
    const file = new File(['xlsx'], 'eventos.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    expect((await screen.findByRole('alert')).textContent).toBe(duplicate.message);
    expect(api.uploadIndicatorImport).toHaveBeenCalledTimes(2);
    expect(api.uploadIndicatorImport).toHaveBeenNthCalledWith(1, 'EVENTS', 'center-1', file, false);
    expect(api.uploadIndicatorImport).toHaveBeenNthCalledWith(2, 'EVENTS', 'center-1', file, true);
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Validar' }).disabled).toBe(false);
    expect(screen.queryByText('Arquivo validado. Revise os registros antes de confirmar.')).toBeNull();
    expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
  });

  it('isola o estado ao trocar de Eventos para Residentes com um batch aberto', async () => {
    // Eventos reais não possuem contracts; a reutilização do estado causava
    // TypeError em contracts.some/length no render de Residentes.
    const event = { ...eventItems[0] };
    delete event.contracts;
    api.getIndicatorImportDraft.mockResolvedValueOnce({ ...eventBatch, draft: { items: [{ ...event, included: true }] } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    await screen.findByText('Evento Anônimo');
    view.rerender(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Importar Empresas Residentes' });
    expect(screen.queryByText('Evento Anônimo')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    vi.restoreAllMocks();
  });
  it('descarta recuperação de batch de outra rota que chega depois de unmount', async () => {
    let resolveDraft;
    api.getIndicatorImportDraft.mockReturnValueOnce(new Promise((resolve) => { resolveDraft = resolve; }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    await waitFor(() => expect(api.getIndicatorImportDraft).toHaveBeenCalledWith('EVENTS', 'center-1'));
    view.rerender(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
    await act(async () => resolveDraft(eventBatch));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByText('Evento Anônimo')).toBeNull();
    vi.restoreAllMocks();
  });
  it.each([['EVENTS', eventBatch], ['RESIDENTS', residentBatch]])('informa lote inválido de %s sem lançar erro na renderização', async (type, batch) => {
    api.getIndicatorImportDraft.mockResolvedValueOnce({ ...batch, draft: null });
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    expect((await screen.findByRole('alert')).textContent).toContain('dados inválidos');
  });
  it('descarta o rascunho do centro anterior quando a resposta chega fora de ordem', async () => {
    api.getInnovationCenters.mockResolvedValueOnce([{ id: 'center-1', name: 'Centro A' }, { id: 'center-2', name: 'Centro B' }]);
    let resolvePrevious;
    api.getIndicatorImportDraft.mockReturnValueOnce(new Promise((resolve) => { resolvePrevious = resolve; })).mockResolvedValueOnce(residentBatch);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
    await waitFor(() => expect(api.getIndicatorImportDraft).toHaveBeenCalledWith('RESIDENTS', 'center-1'));
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: 'center-2' } });
    await screen.findByText('Empresa Anônima');
    await act(async () => resolvePrevious({ ...residentBatch, draft: { items: [{ ...residentItems[0], name: 'Empresa do centro anterior' }] } }));
    expect(screen.queryByText('Empresa do centro anterior')).toBeNull();
    expect(confirm).toHaveBeenCalledOnce();
  });
  it('não recupera rascunho antigo depois que um novo arquivo é selecionado', async () => {
    let resolveDraft;
    api.getIndicatorImportDraft.mockReturnValueOnce(new Promise((resolve) => { resolveDraft = resolve; }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
    await waitFor(() => expect(api.getIndicatorImportDraft).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [new File(['xlsx'], 'Clientes.xlsx')] } });
    await act(async () => resolveDraft(residentBatch));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByText('Empresa Anônima')).toBeNull();
  });
  it.each([['EVENTS', eventBatch, 'eventos'], ['RESIDENTS', residentBatch, 'residentes']])('mantém %s na confirmação e mostra erro quando o servidor falha', async (type, batch, slug) => {
    api.getIndicatorImportDraft.mockResolvedValueOnce({ ...batch, draft: { items: batch.draft.items.map((item) => ({ ...item, included: true, reviewStatus: 'VALIDATED', validationStatus: 'VALID' })) } });
    api.confirmIndicatorImport.mockRejectedValueOnce(new Error('Confirmação falhou'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar para confirmação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Confirmação falhou');
    expect(screen.queryByRole('link', { name: `Ver indicadores de ${slug}` })).toBeNull();
    expect(screen.queryByText('Importação concluída')).toBeNull();
  });
  it('aceita campos de texto opcionais nulos ao recuperar o batch', async () => {
    api.getIndicatorImportDraft.mockResolvedValueOnce({ ...eventBatch, draft: { items: [{ ...eventItems[0], name: null, location: null }] } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    await screen.findByLabelText('Evento da linha 2');
    expect(screen.queryByRole('alert')).toBeNull();
    vi.restoreAllMocks();
  });
  it.each([['EVENTS', eventBatch, 'eventos'], ['RESIDENTS', residentBatch, 'residentes']])('confirma %s antes de disponibilizar a rota de indicadores', async (type, original, slug) => {
    const ready = { ...original, year: 2026, draft: { items: original.draft.items.map((item) => ({ ...item, included: true, reviewStatus: 'VALIDATED' })) } };
    api.getIndicatorImportDraft.mockResolvedValueOnce(ready);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let resolveConfirm;
    api.confirmIndicatorImport.mockReturnValueOnce(new Promise((resolve) => { resolveConfirm = resolve; }));
    render(<MemoryRouter initialEntries={[`/indicadores/importar-${slug}`]}><Routes><Route path={`/indicadores/importar-${slug}`} element={<IndicatorImportPage type={type} />} /><Route path={`/indicadores/${slug}`} element={<h2>Destino confirmado</h2>} /></Routes></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar para confirmação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    expect(screen.queryByRole('link', { name: `Ver indicadores de ${slug}` })).toBeNull();
    await act(async () => resolveConfirm({ ...ready, status: 'IMPORTED' }));
    await screen.findByText('Importação concluída');
    const link = screen.getByRole('link', { name: `Ver indicadores de ${slug}` });
    expect(link.getAttribute('href')).toBe(`/indicadores/${slug}?centerId=center-1&year=2026`);
    fireEvent.click(link);
    await screen.findByRole('heading', { name: 'Destino confirmado' });
    vi.restoreAllMocks();
  });
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
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar selecionados' }));
    assertRows(false);
    expect(screen.getByText('0 selecionado(s)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restaurar selecionados' }).disabled).toBe(true);
    expect(within(monthly()).getByText('Mar').parentElement.querySelector('strong').textContent).toBe(String(total));
    fireEvent.click(screen.getByRole('button', { name: /Salvar revisão/ }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith('batch-1', items.map((item) => expect.objectContaining({
      id: item.id, included: true, reviewStatus: 'VALIDATED',
    })));
    assertRows(false);
  });

  it('exclui e restaura residentes em lote respeitando contratos e continuidade', async () => {
    const items = [
      { ...residentItems[0], name: 'Residente contínuo' },
      {
        ...residentItems[0], id: 'resident-2', name: 'Residente descontínuo', discontinuous: true,
        contracts: [{ ...residentItems[0].contracts[0], eligibleBlock: false }],
      },
    ];
    const loaded = { ...residentBatch, draft: { items } };
    api.uploadIndicatorImport.mockResolvedValueOnce(loaded);
    api.saveIndicatorImportReview.mockImplementation(async (_id, reviewed) => ({ ...loaded, draft: { items: reviewed } }));
    render(<MemoryRouter><IndicatorImportPage type="RESIDENTS" /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Centro de Inovação' });
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [new File(['x'], 'residentes.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await openReview();
    const rows = () => items.map((item) => screen.getByText(item.name).closest('tr'));
    const selectResidents = () => rows().forEach((row) => fireEvent.click(within(row).getAllByRole('checkbox')[0]));
    const assertSelectionCleared = () => {
      expect(screen.getByText('0 selecionado(s)')).toBeTruthy();
      rows().forEach((row) => expect(within(row).getAllByRole('checkbox')[0].checked).toBe(false));
      expect(screen.getByRole('button', { name: 'Excluir dos indicadores' }).disabled).toBe(true);
      expect(screen.getByRole('button', { name: 'Restaurar selecionados' }).disabled).toBe(true);
    };

    selectResidents();
    expect(screen.getByText('2 selecionado(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir dos indicadores' }));
    assertSelectionCleared();
    rows().forEach((row) => {
      expect(within(row).getAllByRole('checkbox')[1].checked).toBe(false);
      expect(within(row).getByText('Ignorado')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Salvar revisão/ }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenNthCalledWith(1, 'batch-2', items.map((item) => ({
      ...item, included: false, reviewStatus: 'EXCLUDED',
    })));

    selectResidents();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar selecionados' }));
    assertSelectionCleared();
    expect(within(rows()[0]).getAllByRole('checkbox')[1].checked).toBe(true);
    expect(within(rows()[1]).getAllByRole('checkbox')[1].checked).toBe(false);
    expect(within(rows()[0]).getByText('Válido')).toBeTruthy();
    expect(within(rows()[1]).getByText('Aviso')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Salvar revisão/ }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenNthCalledWith(2, 'batch-2', [
      { ...items[0], included: true, reviewStatus: 'VALIDATED' },
      { ...items[1], included: false, reviewStatus: 'WITH_WARNINGS' },
    ]);
  });

  it('restaura evento com issues preservando a necessidade de revisão no payload', async () => {
    const item = {
      ...eventItems[0], included: true, reviewStatus: 'VALIDATED', validationStatus: 'REVIEW_REQUIRED',
      duplicateGroup: null, issues: [{ message: 'Data inválida na linha 2' }],
    };
    api.uploadIndicatorImport.mockResolvedValueOnce({ ...eventBatch, draft: { items: [item] } });
    render(<MemoryRouter><IndicatorImportPage type="EVENTS" /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Centro de Inovação' });
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/i), { target: { files: [new File(['x'], 'eventos.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await openReview();
    const row = () => screen.getByText(item.name).closest('tr');

    fireEvent.click(within(row()).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir dos indicadores' }));
    expect(within(row()).getByText('Ignorado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Salvar revisão/ }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenNthCalledWith(1, 'batch-1', [{
      ...item, included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED',
    }]);

    fireEvent.click(within(row()).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar selecionados' }));
    expect(within(row()).getByText('Revisão necessária')).toBeTruthy();
    expect(within(row()).getByRole('button', { name: 'Sim' }).className).toContain('active');
    fireEvent.click(screen.getByRole('button', { name: /Salvar revisão/ }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenNthCalledWith(2, 'batch-1', [{
      ...item, included: true, reviewStatus: 'PENDING', validationStatus: 'REVIEW_REQUIRED',
    }]);
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
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar selecionados' }));
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


describe('ignorar registro individual na revisão', () => {
  it.each(['RESIDENTS', 'EVENTS'])('ignora, mantém visível e restaura erros de %s', async (type) => {
    const resident = type === 'RESIDENTS';
    const issue = { field: resident ? 'document' : 'startAt', message: resident ? 'CNPJ ausente na linha 3' : 'Data inválida na linha 3' };
    const invalid = { ...(resident ? residentItems[0] : eventItems[0]), id: 'invalid', sourceRows: [3], name: 'Registro com erro', included: true, reviewStatus: 'PENDING', validationStatus: 'REVIEW_REQUIRED', issues: [issue] };
    const valid = { ...(resident ? residentItems[0] : eventItems[0]), id: 'valid', name: 'Registro válido', included: true, validationStatus: 'VALID', issues: [] };
    const batch = { ...(resident ? residentBatch : eventBatch), draft: { items: [invalid, valid] } };
    api.uploadIndicatorImport.mockResolvedValue(batch);
    api.saveIndicatorImportReview.mockImplementation(async (_id, items) => ({ ...batch, draft: { items } }));
    api.confirmIndicatorImport.mockResolvedValue({ ...batch, status: 'IMPORTED' });
    const { container } = render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [new File(['xlsx'], 'dados.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await openReview();
    expect(screen.getByText(issue.message)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar para confirmação' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(true);
    expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
    const row = () => screen.getByText('Registro com erro').closest('tr');
    fireEvent.click(within(row()).getByRole('button', { name: 'Ignorar registro' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(row()).getByText('Ignorado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith(batch.id, expect.arrayContaining([expect.objectContaining({ id: 'invalid', included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED' })]));
    fireEvent.click(within(row()).getByRole('button', { name: 'Restaurar' }));
    expect(within(row()).getByText('Revisão necessária')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith(batch.id, expect.arrayContaining([expect.objectContaining({ id: 'invalid', included: true, reviewStatus: 'PENDING', validationStatus: 'REVIEW_REQUIRED', issues: [issue] })]));
    fireEvent.click(within(row()).getByRole('button', { name: 'Ignorar registro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para confirmação' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar importação' }));
    await screen.findByText('Importação confirmada e indicadores atualizados.');
    expect(api.confirmIndicatorImport).toHaveBeenCalledOnce();
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith(batch.id, expect.arrayContaining([expect.objectContaining({ id: 'invalid', included: false, reviewStatus: 'EXCLUDED' }), expect.objectContaining({ id: 'valid', included: true })]));
  });
});

describe('decisões de ignorar persistidas na revisão', () => {
  it.each(['EVENTS', 'RESIDENTS'])('permanece na revisão se o servidor encontrar erro obrigatório ao salvar %s', async (type) => {
    const base = type === 'EVENTS' ? eventBatch : residentBatch;
    const items = ['first', 'second'].map((id) => ({ ...base.draft.items[0], id, name: id, included: true, reviewStatus: 'VALIDATED', validationStatus: 'VALID', issues: [] }));
    const batch = { ...base, draft: { items } };
    api.getIndicatorImportDraft.mockResolvedValueOnce(batch);
    api.saveIndicatorImportReview.mockImplementation(async (_id, reviewed) => ({ ...batch, draft: { items: reviewed.map((item) => item.included ? { ...item, validationStatus: 'REVIEW_REQUIRED', reviewStatus: 'PENDING', issues: [{ message: 'Campo obrigatório ausente' }] } : item) } }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Salvar revisão' });
    fireEvent.click(within(screen.getByText('first', { selector: 'strong' }).closest('tr')).getByRole('button', { name: 'Ignorar registro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(screen.queryByText('Resumo final')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(true);
    expect(api.confirmIndicatorImport).not.toHaveBeenCalled();
  });

  it.each(['EVENTS', 'RESIDENTS'].flatMap((type) => ['individual', 'lote'].map((action) => [type, action])))('libera confirmação e recarrega decisão em %s por ação %s', async (type, action) => {
    const base = type === 'EVENTS' ? eventBatch : residentBatch;
    const items = Array.from({ length: 85 }, (_, index) => ({
      ...base.draft.items[0], id: `item-${index}`, name: `Registro ${index}`, sourceRows: [index + 3],
      included: true, reviewStatus: index === 0 ? 'PENDING' : 'VALIDATED',
      validationStatus: index === 0 ? 'REVIEW_REQUIRED' : 'VALID',
      issues: index === 0 ? [{ message: type === 'RESIDENTS' ? 'CNPJ ausente na linha 3' : 'Data inválida na linha 3' }] : [],
    }));
    let saved = { ...base, summary: { companies: 85, rowsRead: 85 }, draft: { items } };
    api.getIndicatorImportDraft.mockImplementation(async () => saved);
    api.saveIndicatorImportReview.mockImplementation(async (_id, reviewed) => {
      saved = { ...saved, draft: { items: structuredClone(reviewed) } };
      return saved;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const card = (label) => screen.getByText(label, { selector: 'small' }).closest('article').querySelector('strong').textContent;
    const view = render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Salvar revisão' });
    expect(card('Incluídos')).toBe('85');
    expect(card('Inválidos ainda incluídos / pendentes')).toBe('1');
    expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(true);
    if (action === 'individual') {
      fireEvent.click(within(screen.getByText('Registro 0', { selector: 'strong' }).closest('tr')).getByRole('button', { name: 'Ignorar registro' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Ignorar registros incorretos' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ignorar registros' }));
    }
    expect(card('Incluídos')).toBe('84');
    expect(card('Ignorados')).toBe('1');
    expect(card('Inválidos ainda incluídos / pendentes')).toBe('0');
    expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para confirmação' }));
    await screen.findByText('Resumo final');
    expect(saved.draft.items[0]).toMatchObject({ included: false, reviewStatus: 'EXCLUDED', issues: items[0].issues });
    expect(saved.draft.items.slice(1).every((item) => item.included)).toBe(true);
    view.unmount();
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Salvar revisão' });
    expect(card('Incluídos')).toBe('84');
    expect(card('Ignorados')).toBe('1');
    const row = screen.getByText('Registro 0', { selector: 'strong' }).closest('tr');
    expect(within(row).getByText('Ignorado')).toBeTruthy();
    expect(within(row).getByText(items[0].issues[0].message)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(false);
    fireEvent.click(within(row).getByRole('button', { name: 'Restaurar' }));
    expect(card('Inválidos ainda incluídos / pendentes')).toBe('1');
    expect(screen.getByRole('button', { name: 'Ir para confirmação' }).disabled).toBe(true);
  }, 15000);
});

describe('ignorar registros incompletos em lote', () => {
  const load = async (type, items) => {
    const batch = { ...(type === 'RESIDENTS' ? residentBatch : eventBatch), summary: { records: items.length, rowsRead: items.length, companies: items.length, uniqueCnpjs: 3, occupations: items.length }, draft: { items } };
    api.uploadIndicatorImport.mockResolvedValue(batch);
    api.saveIndicatorImportReview.mockImplementation(async (_id, reviewed) => ({ ...batch, draft: { items: reviewed } }));
    api.confirmIndicatorImport.mockResolvedValue({ ...batch, status: 'IMPORTED' });
    render(<MemoryRouter><IndicatorImportPage type={type} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Centro').value).toBe('center-1'));
    fireEvent.change(screen.getByLabelText(/Selecionar arquivo/), { target: { files: [new File(['xlsx'], 'dados.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await openReview();
    return batch;
  };
  const card = (label) => screen.getByText(label, { selector: '.import-summary small' }).parentElement.querySelector('strong').textContent;
  const row = (name) => screen.getByText(name, { selector: 'strong' }).closest('tr');

  it('mantém o foco no diálogo e cancela por Escape sem alterar registros', async () => {
    const item = { ...eventItems[0], included: true, validationStatus: 'REVIEW_REQUIRED', reviewStatus: 'PENDING' };
    await load('EVENTS', [item]);
    const trigger = screen.getByRole('button', { name: 'Ignorar registros incorretos' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    const cancel = within(dialog).getByRole('button', { name: 'Cancelar' });
    const ignore = within(dialog).getByRole('button', { name: 'Ignorar registros' });
    expect(document.activeElement).toBe(cancel);

    // Internal navigation stays native; only the two boundaries wrap focus.
    expect(fireEvent.keyDown(cancel, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(cancel);
    expect(fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(ignore);
    expect(fireEvent.keyDown(ignore, { key: 'Tab', shiftKey: true })).toBe(true);
    expect(document.activeElement).toBe(ignore);
    expect(fireEvent.keyDown(ignore, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBe(dialog);
    fireEvent.keyDown(cancel, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(card('Revisão necessária')).toBe('1');
    expect(card('Ignorados')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith('batch-1', [item]);
  });

  it.each(['EVENTS', 'RESIDENTS'])('ignora também os incompletos fora da página atual em %s', async (type) => {
    const base = type === 'RESIDENTS' ? residentItems[0] : eventItems[0];
    const items = Array.from({ length: 22 }, (_, index) => ({
      ...base, id: `record-${index}`, name: `Registro ${index}`, sourceRows: [index + 2],
      included: true, reviewStatus: index === 0 || index === 21 ? 'PENDING' : 'VALIDATED',
      validationStatus: index === 0 || index === 21 ? 'REVIEW_REQUIRED' : 'VALID',
      issues: index === 0 || index === 21 ? [{ message: 'Campo obrigatório ausente' }] : [],
    }));
    const batch = await load(type, items);
    expect(row('Registro 0')).toBeTruthy();
    expect(screen.queryByText('Registro 21', { selector: 'strong' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar registros incorretos' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ignorar registros' }));
    expect(card('Revisão necessária')).toBe('0');
    expect(card('Ignorados')).toBe('2');
    expect(card('Válidos')).toBe('20');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(within(row('Registro 21')).getByText('Ignorado')).toBeTruthy();
    expect(within(row('Registro 20')).getByText('Válido')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith(batch.id, items.map((item, index) =>
      index === 0 || index === 21 ? { ...item, included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED' } : item));
  });

  it('restaura residentes válidos e com avisos sem restaurar os não selecionados', async () => {
    const excluded = { ...residentItems[0], sourceRows: [4], included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED' };
    const items = [
      { ...excluded, id: 'valid', name: 'Válido selecionado', issues: [] },
      { ...excluded, id: 'warning', name: 'Aviso selecionado', discontinuous: true },
      { ...excluded, id: 'other', name: 'Não selecionado', issues: [] },
    ];
    const batch = await load('RESIDENTS', items);
    for (const name of ['Válido selecionado', 'Aviso selecionado']) {
      fireEvent.click(within(row(name)).getAllByRole('checkbox')[0]);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar selecionados' }));
    expect(within(row('Válido selecionado')).getByText('Válido')).toBeTruthy();
    expect(within(row('Aviso selecionado')).getByText('Aviso')).toBeTruthy();
    expect(within(row('Não selecionado')).getByText('Ignorado')).toBeTruthy();
    expect(card('Ignorados')).toBe('1');
    expect(card('Válidos')).toBe('1');
    expect(card('Avisos')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith(batch.id, [
      { ...items[0], included: true, reviewStatus: 'VALIDATED', validationStatus: 'VALID' },
      { ...items[1], included: true, reviewStatus: 'WITH_WARNINGS', validationStatus: 'WARNING' },
      items[2],
    ]);
  });

  it.each(['EVENTS', 'RESIDENTS'])('exibe botão desabilitado sem bloqueantes em %s, mesmo com avisos', async (type) => {
    const base = type === 'RESIDENTS' ? residentItems[0] : eventItems[0];
    await load(type, [{ ...base, included: true, validationStatus: 'WARNING', issues: [{ message: 'Aviso não bloqueante' }] }]);
    expect(screen.getByRole('button', { name: 'Ignorar registros incorretos' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Ignorar registro' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each(['EVENTS', 'RESIDENTS'])('confirma, ignora somente bloqueantes, recalcula e restaura em %s', async (type) => {
    const base = type === 'RESIDENTS' ? residentItems[0] : eventItems[0];
    const invalid = (id) => ({ ...base, id, sourceRows: [Number(id)], name: `Incompleto ${id}`, contracts: type === 'RESIDENTS' && id === '3' ? base.contracts.map((contract) => ({ ...contract, eligibleBlock: false })) : base.contracts, included: true, validationStatus: 'REVIEW_REQUIRED', reviewStatus: 'PENDING', issues: [{ message: `Erro impeditivo ${id}` }] });
    const items = [invalid('3'), { ...invalid('4'), included: type === 'RESIDENTS' }, { ...base, id: 'warning', sourceRows: [5], name: 'Registro com aviso', included: true, validationStatus: 'WARNING', reviewStatus: 'WITH_WARNINGS', issues: [{ message: 'Aviso não bloqueante' }] }, { ...base, id: 'valid', sourceRows: [6], name: 'Registro válido', included: true, validationStatus: 'VALID', reviewStatus: 'VALIDATED', issues: [] }, { ...invalid('7'), included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED' }];
    const batch = await load(type, items);
    expect(card(type === 'EVENTS' ? 'Registros encontrados' : 'Linhas lidas')).toBe('5');
    expect(card('Revisão necessária')).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar registros incorretos' }));
    const dialog = screen.getByRole('dialog', { name: 'Ignorar 2 registros inválidos?' });
    expect(within(dialog).getByText('Esses registros não serão considerados na atualização dos indicadores. Eles poderão ser restaurados antes da confirmação da importação.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(card('Revisão necessária')).toBe('2');
    // The action covers the whole draft, including records hidden by filters.
    fireEvent.change(screen.getByPlaceholderText(type === 'EVENTS' ? 'Buscar evento' : 'Buscar empresa'), { target: { value: 'Registro válido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar registros incorretos' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ignorar registros' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(card('Revisão necessária')).toBe('0');
    expect(card('Ignorados')).toBe('3');
    expect(card('Válidos')).toBe('1');
    expect(card(type === 'EVENTS' ? 'Com aviso' : 'Avisos')).toBe('1');
    expect(card(type === 'EVENTS' ? 'Registros encontrados' : 'Linhas lidas')).toBe('5');
    if (type === 'RESIDENTS') {
      expect(card('Empresas identificadas')).toBe('5');
      expect(card('CNPJs únicos')).toBe('3');
      expect(card('Ocupações')).toBe('5');
    }
    expect(screen.getByRole('button', { name: 'Ignorar registros incorretos' }).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(type === 'EVENTS' ? 'Buscar evento' : 'Buscar empresa'), { target: { value: '' } });
    expect(within(row('Incompleto 3')).getByText('Ignorado')).toBeTruthy();
    expect(within(row('Incompleto 4')).getByText('Ignorado')).toBeTruthy();
    expect(within(row('Registro com aviso')).getByText('Aviso')).toBeTruthy();
    fireEvent.click(within(row('Incompleto 3')).getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar selecionados' }));
    expect(within(row('Incompleto 3')).getByText('Revisão necessária')).toBeTruthy();
    expect(card('Revisão necessária')).toBe('1');
    expect(card('Ignorados')).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await screen.findByText('Revisão salva com sucesso.');
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith(batch.id, expect.arrayContaining([
      expect.objectContaining({ id: '3', included: true, reviewStatus: 'PENDING', validationStatus: 'REVIEW_REQUIRED' }),
      expect.objectContaining({ id: '4', included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED' }),
      expect.objectContaining({ id: 'warning', included: true, reviewStatus: 'WITH_WARNINGS', validationStatus: 'WARNING' }),
      expect.objectContaining({ id: 'valid', included: true, validationStatus: 'VALID' }),
    ]));
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar registros incorretos' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ignorar registros' }));
    expect(screen.getByRole('button', { name: 'Continuar para confirmação' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para confirmação' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar importação' }));
    await screen.findByText('Importação confirmada e indicadores atualizados.');
    expect(api.saveIndicatorImportReview).toHaveBeenLastCalledWith(batch.id, expect.arrayContaining([
      expect.objectContaining({ id: '3', included: false, reviewStatus: 'EXCLUDED' }),
      expect.objectContaining({ id: '4', included: false, reviewStatus: 'EXCLUDED' }),
      expect.objectContaining({ id: 'warning', included: true, validationStatus: 'WARNING' }),
      expect.objectContaining({ id: 'valid', included: true }),
    ]));
    expect(api.confirmIndicatorImport).toHaveBeenCalledWith(batch.id);
  });
});
