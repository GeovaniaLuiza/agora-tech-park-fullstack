import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEventWorkbook, summarizeEvents } from '../src/services/eventImportParser.js';
import { RESERVATION_HEADERS } from '../src/services/reservationImportParser.js';
import { EVENT_HEADERS, XLSX_MIME } from '../src/domain/indicatorImportCatalog.js';
import { eventWorkbookFixture, reservationWorkbookFixture } from './fixtures/indicator-import-workbooks.js';

const mocks = vi.hoisted(() => ({ findBatch: vi.fn(), saveDraft: vi.fn(), createBatch: vi.fn(), findCenter: vi.fn(), findPrevious: vi.fn(), replaceBatchRecords: vi.fn(), markImported: vi.fn(), recompute: vi.fn() }));
vi.mock('../src/repositories/indicatorImportRepository.js', () => mocks);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: vi.fn() }));
vi.mock('../src/services/indicatorCalculationService.js', () => ({ recompute: mocks.recompute }));
import { preview, saveReview, getBatch, confirm, groupEvents } from '../src/services/indicatorImportService.js';

export const reservationRow = (overrides = {}) => RESERVATION_HEADERS.map((header) => ({
  ID: 'synthetic-1', 'Data de início': '01/10/2026', 'Data de término': '01/10/2026', Horário: '08:00 - 12:00',
  Sala: 'Sala A', Tipo: 'Evento', Responsável: 'Pessoa A', Cliente: 'Atividade A', Empresa: 'Empresa A',
  Site: 'Unidade A', 'Prédio / Torre': 'HUB', Andar: '1', Status: 'Confirmada', ...overrides,
})[header]);
const admin = { role: 'ADMIN', sub: 'admin' };
beforeEach(() => vi.resetAllMocks());

describe('Exportação de Reservas', () => {
  it('reproduz estrutura, datas, estados e multiplicidades reais com dados anônimos', async () => {
    const parsed = await parseEventWorkbook(await reservationWorkbookFixture());
    expect(parsed.errors).toEqual([]);
    expect(parsed.sheetName).toBe('Exportação');
    expect(parsed.summary).toMatchObject({ rowsRead: 115, records: 101, possibleEvents: 98, valid: 98, ignored: 3 });
    expect(parsed.items.filter((item) => item.grouped)).toHaveLength(14);
    expect(parsed.items.every((item) => !item.included)).toBe(true);
    const reviewed = parsed.items.map((item) => ({ ...item, included: !item.ignored }));
    expect(summarizeEvents(reviewed).monthly[9]).toBe(98);
  });
  it('continua aceitando Eventos e usa o mesmo modelo interno para dados equivalentes', async () => {
    expect((await parseEventWorkbook(await eventWorkbookFixture())).errors).toEqual([]);
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Eventos').addRows([EVENT_HEADERS, ['Atividade A', '01/10/2026', 'Sala A', '', '', 'Evento', '', '']]);
    const old = await parseEventWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    const next = await parseEventWorkbook(await reservationWorkbookFixture([reservationRow()]));
    for (const field of ['name', 'startAt', 'location', 'theme', 'mode', 'subtype', 'participants', 'participatingCompanies', 'included', 'reviewStatus', 'validationStatus']) expect(next.items[0][field]).toEqual(old.items[0][field]);
  });
  it('dá prioridade à aba Eventos, inclusive quando inválida', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Eventos').addRow(['Errado']);
    workbook.addWorksheet('Exportação').addRows([RESERVATION_HEADERS, reservationRow()]);
    expect((await parseEventWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()))).errors[0].message).toContain('Lista');
  });
  it('informa formatos aceitos e colunas mínimas ausentes', async () => {
    const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('Outra');
    expect((await parseEventWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()))).errors[0]).toMatchObject({ code: 'UNRECOGNIZED_EVENT_FORMAT', message: expect.stringContaining("'Eventos'") });
    const headers = RESERVATION_HEADERS.filter((header) => header !== 'Data de início');
    expect((await parseEventWorkbook(await reservationWorkbookFixture([], headers))).errors[0].message).toBe("Coluna 'Data de início' não encontrada na aba 'Exportação'.");
  });
  it('aceita colunas em outra ordem e campos complementares vazios', async () => {
    const headers = ['Status', 'Sala', 'Cliente', 'ID', 'Data de início', 'Tipo', 'Horário'];
    const values = Object.fromEntries(RESERVATION_HEADERS.map((header, index) => [header, reservationRow()[index]]));
    const parsed = await parseEventWorkbook(await reservationWorkbookFixture([headers.map((header) => values[header])], headers));
    expect(parsed.items[0]).toMatchObject({ name: 'Atividade A', endAt: null, participants: null, participatingCompanies: null, validationStatus: 'VALID' });
  });
  it.each(['Cancelada', 'Cancelado', 'Pré-reservada', 'Pendente', '', 'Confirmada parcialmente'])('ignora status %s sem permitir inclusão pela revisão', async (Status) => {
    const parsed = await parseEventWorkbook(await reservationWorkbookFixture([reservationRow({ Status })]));
    expect(parsed.items[0]).toMatchObject({ ignored: true, included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED' });
    expect(parsed.warnings.some((warning) => warning.code === 'NO_CONFIRMED_RESERVATIONS')).toBe(true);
    const batch = { id: 'batch', import_type: 'EVENTS', status: 'WITH_WARNINGS', year: 2026, draft: { items: parsed.items } };
    mocks.findBatch.mockResolvedValue(batch);
    mocks.saveDraft.mockImplementation(async (_id, data) => ({ ...batch, ...data }));
    const saved = await saveReview('batch', { items: parsed.items.map((item) => ({ ...item, ignored: false, reservationConfirmed: true, included: true })) }, admin);
    expect(saved.draft.items[0]).toMatchObject({ ignored: true, reservationConfirmed: false, included: false });
    await expect(groupEvents('batch', { itemIds: [parsed.items[0].id] }, admin)).rejects.toMatchObject({ code: 'INVALID_EVENT_GROUP' });
    await expect(confirm('batch', admin)).rejects.toMatchObject({ code: 'NO_INCLUDED_RECORDS' });
  });
  it('consolida múltiplas salas preservando metadados individuais e IDs', async () => {
    const parsed = await parseEventWorkbook(await reservationWorkbookFixture([
      reservationRow(), reservationRow({ ID: 'synthetic-2', Sala: 'Sala B', Responsável: 'Pessoa B', Andar: '2' }),
    ]));
    expect(parsed.items).toHaveLength(1);
    expect(parsed.summary.rowsRead).toBe(2);
    expect(parsed.items[0]).toMatchObject({ location: 'Sala A / Sala B', sourceRows: [2, 3], sourceIds: ['synthetic-1', 'synthetic-2'], grouped: true });
    expect(parsed.items[0].reservations[1]).toMatchObject({ responsible: 'Pessoa B', floor: '2', company: 'Empresa A', site: 'Unidade A', building: 'HUB', schedule: '08:00 - 12:00' });
  });
  it.each([{ Horário: '13:00 - 17:00' }, { Cliente: 'Outra atividade' }, { Empresa: 'Outra empresa' }, { Tipo: 'Outro tipo' }, { Site: 'Outro site' }, { 'Data de término': '02/10/2026' }])('mantém atividades distintas: %j', async (overrides) => {
    const parsed = await parseEventWorkbook(await reservationWorkbookFixture([reservationRow(), reservationRow({ ID: 'synthetic-2', ...overrides })]));
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].sourceKey).not.toBe(parsed.items[1].sourceKey);
  });
  it('não agrupa registros sem identificação/horário; preserva inválidos para correção', async () => {
    const parsed = await parseEventWorkbook(await reservationWorkbookFixture([
      reservationRow({ ID: '', Cliente: '', Empresa: '', Horário: '', 'Data de início': '31/09/2026', Sala: '' }),
      reservationRow({ ID: 'synthetic-2', Horário: '' }),
    ]));
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['name', 'startAt', 'location', 'sourceId', 'schedule']));
  });
  it('usa Empresa quando Cliente está vazio e sinaliza término inválido', async () => {
    const parsed = await parseEventWorkbook(await reservationWorkbookFixture([reservationRow({ Cliente: '', 'Data de término': 'inválida' })]));
    expect(parsed.items[0].name).toBe('Empresa A');
    expect(parsed.items[0].issues).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'endAt' })]));
  });
  it('bloqueia IDs conflitantes e não substitui atividades distintas dentro do mesmo arquivo', async () => {
    const parsed = await parseEventWorkbook(await reservationWorkbookFixture([reservationRow(), reservationRow({ Horário: '13:00 - 17:00' })]));
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items.every((item) => item.validationStatus === 'REVIEW_REQUIRED')).toBe(true);
    expect(parsed.items.every((item) => item.issues.some((issue) => issue.field === 'sourceId'))).toBe(true);
  });
  it('salva inválido incluído, bloqueia confirmação e permite corrigir horário/término sem perder fonte original', async () => {
    const parsed = await parseEventWorkbook(await reservationWorkbookFixture([reservationRow({ Horário: 'errado', 'Data de término': 'errada' })]));
    let stored = { id: 'batch', import_type: 'EVENTS', year: 2026, status: 'WITH_WARNINGS', draft: { items: parsed.items } };
    mocks.findBatch.mockImplementation(async () => structuredClone(stored));
    mocks.saveDraft.mockImplementation(async (_id, data) => (stored = { ...stored, ...data }));
    const saved = await saveReview('batch', { items: parsed.items.map(item => ({ ...item, included: true })) }, admin);
    expect(saved.summary.invalidIncluded).toBe(1);
    await expect(confirm('batch', admin)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    const corrected = await saveReview('batch', { items: saved.draft.items.map(item => ({ ...item, schedule: '08:00 - 12:00', endDateRaw: '01/10/2026' })) }, admin);
    expect(corrected.summary).toMatchObject({ included: 1, valid: 1, invalidIncluded: 0, corrected: 1 });
    expect(corrected.draft.items[0].reservations[0].schedule).toBe('errado');
    expect(corrected.draft.items[0].sourceKey).toBe(parsed.items[0].sourceKey);
  });
  it('mantém chave estável quando arquivo muda de ordem e IDs quando somente parte das salas reaparece', async () => {
    const a = reservationRow(), b = reservationRow({ ID: 'synthetic-2', Sala: 'Sala B' });
    const first = await parseEventWorkbook(await reservationWorkbookFixture([a, b]));
    const reordered = await parseEventWorkbook(await reservationWorkbookFixture([b, a]));
    const subset = await parseEventWorkbook(await reservationWorkbookFixture([b]));
    expect(first.items[0].sourceKey).toBe(reordered.items[0].sourceKey);
    expect(first.items[0].sourceKey).toBe(subset.items[0].sourceKey);
  });
  it('salva/recarrega revisão, ignora inválido e confirma na mesma fonte e cálculo de Eventos', async () => {
    const buffer = await reservationWorkbookFixture([reservationRow(), reservationRow({ ID: 'bad', 'Data de início': 'inválida' }), reservationRow({ ID: 'cancelled', Status: 'Cancelada' })]);
    let stored;
    mocks.findCenter.mockResolvedValue({ name: 'Centro' });
    mocks.createBatch.mockImplementation(async (data) => (stored = { ...data, id: 'batch', import_type: data.importType, innovation_center_id: 'center', sheet_name: data.sheetName }));
    mocks.findBatch.mockImplementation(async () => structuredClone(stored));
    mocks.saveDraft.mockImplementation(async (_id, data) => (stored = { ...stored, ...data }));
    const loaded = await preview({ type: 'EVENTS', fileName: 'Reservas.xlsx', mimeType: XLSX_MIME, buffer, centerId: 'center' }, admin);
    expect(loaded.sheetName).toBe('Exportação');
    await saveReview('batch', { items: loaded.draft.items.map((item) => ({ ...item, included: item.validationStatus === 'VALID', reviewStatus: item.validationStatus === 'VALID' ? 'VALIDATED' : 'EXCLUDED' })) }, admin);
    const saved = await getBatch('batch', admin);
    expect(saved.summary).toMatchObject({ included: 1, invalidIncluded: 0, ignored: 2 });
    expect(saved.draft.items[0].reservations).toEqual(loaded.draft.items[0].reservations);
    mocks.replaceBatchRecords.mockImplementation(async (_batch, records, _user, finalize) => {
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ recordType: 'EVENT', eventAt: '2026-10-01T00:00:00.000Z', extra: { sourceFormat: 'RESERVATIONS', sourceIds: ['synthetic-1'] } });
      return finalize('transaction');
    });
    mocks.markImported.mockImplementation(async (_id, data) => ({ ...stored, status: 'IMPORTED', ...data }));
    const confirmed = await confirm('batch', admin);
    expect(confirmed.summary).toMatchObject({ processed: 1, indicatorsUpdated: true });
    expect(confirmed.summary.monthly[9]).toBe(1);
    expect(mocks.recompute).toHaveBeenCalledWith('center', 2026, 'admin', 'transaction', expect.arrayContaining(['EVENTOS_REALIZADOS']));
  });
});
