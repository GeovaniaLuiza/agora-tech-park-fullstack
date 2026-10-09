import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consolidateResidents, normalizeResident, summarizeResidents } from '../src/services/residentImportParser.js';
import { summarizeEvents, validateEvent } from '../src/services/eventImportParser.js';

const mocks = vi.hoisted(() => ({
  repo: { findBatch: vi.fn(), saveDraft: vi.fn(), replaceBatchRecords: vi.fn(), markImported: vi.fn() },
  audit: vi.fn(), recompute: vi.fn(),
}));
vi.mock('../src/repositories/indicatorImportRepository.js', () => mocks.repo);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));
vi.mock('../src/services/indicatorCalculationService.js', () => ({ recompute: mocks.recompute }));
import { confirm, saveReview } from '../src/services/indicatorImportService.js';
const user = { sub: 'admin', role: 'ADMIN' };
let current;
const resident = (id, overrides = {}) => normalizeResident({
  id, name: id, sourceRows: [Number(id.slice(1))], document: '11222333000181', included: true, reviewStatus: 'PENDING',
  contracts: [{ sourceRow: Number(id.slice(1)), legend: 'Locada', block: 'HUB', unit: id, areaInput: '10', startInput: '01/01/2026', endInput: '' }], ...overrides,
});
const setup = (type, items) => {
  current = { id: 'batch', import_type: type, status: 'WITH_WARNINGS', year: 2026, innovation_center_id: 'center', draft: { items }, warnings: [], summary: {} };
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.findBatch.mockImplementation(async () => current);
  mocks.repo.saveDraft.mockImplementation(async (_id, data) => (current = { ...current, ...data }));
  mocks.repo.replaceBatchRecords.mockImplementation(async (_batch, _records, _user, finalize) => finalize(undefined));
  mocks.repo.markImported.mockImplementation(async (_id, data) => (current = { ...current, status: 'IMPORTED', summary: data.summary }));
});
const review = (items) => saveReview('batch', { items }, user);
const exclude = (item) => ({ ...item, included: false, reviewStatus: 'EXCLUDED' });
const restore = (item) => ({ ...item, included: true, reviewStatus: 'PENDING' });

describe('exclusão em lote de bloqueantes', () => {
  it.each(['EVENTS', 'RESIDENTS'])('identifica exatamente cada registro bloqueante em %s', async (type) => {
    const items = type === 'RESIDENTS' ? [resident('r3', { document: '' }), resident('r4', { document: '' })]
      : [3, 4].map((row) => ({ id: `e${row}`, name: `Evento ${row}`, sourceRows: [row], startAt: null, location: 'HUB', included: true }));
    setup(type, items);
    const error = await confirm('batch', user).catch((reason) => reason);
    expect(error.code).toBe('REVIEW_REQUIRED');
    expect(error.details.issues).toEqual(expect.arrayContaining(items.map((item) => expect.objectContaining({ itemId: item.id }))));
    expect(mocks.repo.replaceBatchRecords).not.toHaveBeenCalled();
  });
  it.each(['EVENTS', 'RESIDENTS'])('preserva avisos, restaura erros e confirma somente incluídos em %s', async (type) => {
    let items;
    if (type === 'RESIDENTS') {
      items = [resident('r3', { document: '' }), resident('r4', { document: '' }), resident('r5', {
        sourceRows: [5, 6], contracts: [
          { sourceRow: 5, legend: 'Locada', block: 'HUB', unit: '201', areaInput: '10', startInput: '01/01/2026', endInput: '31/01/2026' },
          { sourceRow: 6, legend: 'Locada', block: 'HUB', unit: '201', areaInput: '10', startInput: '01/03/2026', endInput: '' },
        ],
      }), resident('r7', { document: '04252011000110' })];
    } else {
      const event = (id, overrides = {}) => {
        const item = { id, name: id, sourceRows: [Number(id.slice(1))], startAt: '2026-01-01T00:00:00Z', location: 'HUB', included: true, reviewStatus: 'VALIDATED', ...overrides };
        item.issues = validateEvent(item);
        item.validationStatus = item.issues.length ? 'REVIEW_REQUIRED' : item.duplicateGroup ? 'WARNING' : 'VALID';
        return item;
      };
      items = [event('e3', { name: '' }), event('e4', { startAt: null }), event('e5', { duplicateGroup: 'dup' }), event('e7')];
    }
    const summarize = type === 'RESIDENTS' ? summarizeResidents : summarizeEvents;
    const original = summarize(items);
    expect(original).toMatchObject({ needsReview: 2, warnings: 1, valid: 1 });
    setup(type, items);
    await expect(confirm('batch', user)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    const ignoreIncomplete = () => review(current.draft.items.map((item) => item.validationStatus === 'REVIEW_REQUIRED' ? exclude(item) : item));
    await ignoreIncomplete();
    expect(current.draft.items).toHaveLength(4);
    expect(current.summary).toMatchObject({ needsReview: 0, ignored: 2, warnings: 1, valid: 1, rowsRead: original.rowsRead, records: original.records });
    if (type === 'RESIDENTS') expect(current.summary).toMatchObject({ companies: original.companies, uniqueCnpjs: original.uniqueCnpjs, occupations: original.occupations });
    expect(current.draft.items.slice(0, 2)).toEqual([expect.objectContaining({ included: false, validationStatus: 'IGNORED' }), expect.objectContaining({ included: false, validationStatus: 'IGNORED' })]);
    await review(current.draft.items.map((item, index) => index === 0 ? restore(item) : item));
    expect(current.draft.items[0]).toMatchObject({ included: true, validationStatus: 'REVIEW_REQUIRED' });
    expect(current.summary).toMatchObject({ needsReview: 1, ignored: 1 });
    await expect(confirm('batch', user)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    await ignoreIncomplete();
    await confirm('batch', user);
    const records = mocks.repo.replaceBatchRecords.mock.calls[0][1];
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.name)).toEqual(items.slice(2).map((item) => item.name));
    expect(current.summary).toMatchObject({ processed: 2, ignored: 2 });
  });
});

describe('exclusão individual de registros', () => {
  it.each(['EVENTS', 'RESIDENTS'])('mantém erro obrigatório no draft ignorado e rejeita confirmar sem incluídos em %s', async (type) => {
    const invalid = type === 'RESIDENTS' ? resident('r3', { document: '' }) : {
      id: 'e3', sourceRows: [3], name: 'Evento sem data', startAt: null, location: 'HUB', included: true,
    };
    setup(type, [invalid]);
    await expect(confirm('batch', user)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    const saved = await review([exclude(invalid)]);
    const reloaded = await mocks.repo.findBatch('batch');
    expect(reloaded.draft).toEqual(saved.draft);
    expect(reloaded.draft.items[0]).toMatchObject({ included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED' });
    expect(reloaded.draft.items[0].issues.length).toBeGreaterThan(0);
    expect(reloaded.summary).toMatchObject({ included: 0, ignored: 1, needsReview: 0 });
    await expect(confirm('batch', user)).rejects.toMatchObject({ code: 'NO_INCLUDED_RECORDS' });
    expect(mocks.repo.replaceBatchRecords).not.toHaveBeenCalled();
  });

  it.each(['document', 'date', 'block', 'legend'])('ignora residente com erro de %s e restaura validação real', async (field) => {
    const invalid = resident('r3', field === 'document' ? { document: '' } : { contracts: [{ sourceRow: 3, legend: field === 'legend' ? 'Outra' : 'Locada', block: field === 'block' ? 'OUTRO' : 'HUB', areaInput: '10', startInput: field === 'date' ? 'data inválida' : '01/01/2026' }] });
    expect(invalid.validationStatus).toBe('REVIEW_REQUIRED');
    if (field === 'document') expect(invalid.issues[0].message).toBe('CNPJ ausente na linha 3');
    setup('RESIDENTS', [invalid, resident('r4', { document: '04252011000110' })]);
    await expect(confirm('batch', user)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    const saved = await review(current.draft.items.map((item) => item.id === 'r3' ? exclude(item) : item));
    expect(saved.draft.items).toHaveLength(2);
    expect(saved.draft.items[0]).toMatchObject({ included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED' });
    expect(saved.warnings).toEqual([]);
    expect(saved.summary.monthly).toEqual(Array(12).fill(1));
    await review(current.draft.items.map((item) => item.id === 'r3' ? restore(item) : item));
    expect(current.draft.items.find((item) => item.id === 'r3')).toMatchObject({ included: true, validationStatus: 'REVIEW_REQUIRED', reviewStatus: 'PENDING' });
    await expect(confirm('batch', user)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    await review(current.draft.items.map((item) => item.id === 'r3' ? exclude(item) : item));
    await confirm('batch', user);
    expect(mocks.repo.replaceBatchRecords).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ name: 'r4' })], user.sub, expect.any(Function));
    expect(current.draft.items.find((item) => item.id === 'r3').reviewStatus).toBe('EXCLUDED');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ imported: 1, ignored: 1 }) }));
  });
  it('ignora vários, mantém consolidação dos demais e restaura residente válido', async () => {
    const consolidated = consolidateResidents([resident('r4'), resident('r5')]);
    expect(consolidated).toHaveLength(1);
    expect(consolidated[0].contracts).toHaveLength(2);
    setup('RESIDENTS', [resident('r3', { document: '' }), resident('r6', { document: '' }), ...consolidated]);
    await review(current.draft.items.map((item) => item.document ? item : exclude(item)));
    await confirm('batch', user);
    expect(current.summary).toMatchObject({ included: 1, processed: 1, ignored: 2 });
    const valid = resident('r7');
    setup('RESIDENTS', [valid]);
    await review([exclude(valid)]);
    await review([restore(current.draft.items[0])]);
    expect(current.draft.items[0]).toMatchObject({ included: true, reviewStatus: 'VALIDATED', validationStatus: 'VALID' });
  });
  it('não reincorpora ocupação excluída ao consolidar CNPJs iguais', async () => {
    setup('RESIDENTS', [resident('r3'), resident('r4')]);
    await review([exclude(current.draft.items[0]), current.draft.items[1]]);
    expect(current.draft.items).toHaveLength(2);
    await confirm('batch', user);
    const records = mocks.repo.replaceBatchRecords.mock.calls[0][1];
    expect(records).toHaveLength(1);
    expect(records[0].sourceRows).toEqual([4]);
  });
  it('ignora evento, restaura problemas e não inclui o excluído nos indicadores', async () => {
    const valid = { id: 'e2', sourceRows: [2], name: 'Evento válido', location: 'HUB', startAt: '2026-01-01T00:00:00Z', included: true };
    const invalid = { ...valid, id: 'e3', sourceRows: [3], name: 'Evento inválido', startAt: null };
    setup('EVENTS', [valid, invalid]);
    await expect(confirm('batch', user)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    await review([valid, exclude(invalid)]);
    expect(current.draft.items[1]).toMatchObject({ included: false, reviewStatus: 'EXCLUDED', validationStatus: 'IGNORED' });
    expect(current.warnings).toEqual([]);
    expect(current.summary.monthly[0]).toBe(1);
    await review(current.draft.items.map(restore));
    expect(current.draft.items[1].validationStatus).toBe('REVIEW_REQUIRED');
    await expect(confirm('batch', user)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    await review(current.draft.items.map((item) => item.id === 'e3' ? exclude(item) : item));
    await confirm('batch', user);
    expect(mocks.repo.replaceBatchRecords.mock.calls[0][1]).toEqual([expect.objectContaining({ name: 'Evento válido' })]);
    expect(current.summary).toMatchObject({ processed: 1, ignored: 1 });
  });
});
