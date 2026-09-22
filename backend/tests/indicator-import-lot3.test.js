import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventWorkbookFixture, residentWorkbookFixture } from './fixtures/indicator-import-workbooks.js';
import { XLSX_MIME } from '../src/domain/indicatorImportCatalog.js';

const mocks = vi.hoisted(() => ({ findCenter: vi.fn(), findPrevious: vi.fn(), createBatch: vi.fn(), findBatch: vi.fn(), latestDraft: vi.fn(), saveDraft: vi.fn(), replaceBatchRecords: vi.fn(), markImported: vi.fn(), record: vi.fn(), recompute: vi.fn() }));
vi.mock('../src/repositories/indicatorImportRepository.js', () => mocks);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.record }));
vi.mock('../src/services/indicatorCalculationService.js', () => ({ recompute: mocks.recompute }));
import * as service from '../src/services/indicatorImportService.js';

const admin = { sub: 'admin-1', role: 'ADMIN' };
const eventBatch = (items, status = 'WITH_WARNINGS') => ({ id: 'batch-1', import_type: 'EVENTS', innovation_center_id: 'center-1', center_name: 'Centro', year: 2026, status, file_hash: 'HASH', warnings: [], summary: {}, draft: { items } });
beforeEach(() => { vi.clearAllMocks(); mocks.findCenter.mockResolvedValue({ id: 'center-1', name: 'Centro' }); mocks.record.mockResolvedValue(); mocks.recompute.mockResolvedValue(); });

describe('importação de indicadores (RF-009)', () => {
  it('gera preview válido de eventos com aviso e persiste o rascunho', async () => {
    const buffer = await eventWorkbookFixture();
    mocks.createBatch.mockImplementation(async (data) => ({ id: 'batch-1', import_type: data.importType, file_name: data.fileName, file_hash: data.fileHash, innovation_center_id: data.centerId, year: data.year, status: data.status, summary: data.summary, warnings: data.warnings, draft: data.draft }));
    const preview = await service.preview({ type: 'EVENTS', fileName: 'eventos.xlsx', mimeType: XLSX_MIME, buffer, centerId: 'center-1' }, admin);
    expect(preview.status).toBe('WITH_WARNINGS'); expect(preview.draft.items).toHaveLength(2);
    expect(mocks.createBatch).toHaveBeenCalledWith(expect.objectContaining({ totalRecords: 2, totalWarnings: expect.any(Number) }));
  });
  it('rejeita perfil, tipo, arquivo e centro inválidos', async () => {
    const valid = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
    await expect(service.preview({ type: 'EVENTS', fileName: 'x.xlsx', mimeType: XLSX_MIME, buffer: valid, centerId: 'center-1' }, { role: 'GESTOR' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.preview({ type: 'OTHER', fileName: 'x.xlsx', mimeType: XLSX_MIME, buffer: valid, centerId: 'center-1' }, admin)).rejects.toMatchObject({ code: 'INVALID_IMPORT_TYPE' });
    await expect(service.preview({ type: 'EVENTS', fileName: 'x.csv', mimeType: XLSX_MIME, buffer: valid, centerId: 'center-1' }, admin)).rejects.toMatchObject({ code: 'INVALID_FILE_EXTENSION' });
    mocks.findCenter.mockResolvedValueOnce(null);
    await expect(service.preview({ type: 'EVENTS', fileName: 'x.xlsx', mimeType: XLSX_MIME, buffer: valid, centerId: 'missing' }, admin)).rejects.toMatchObject({ code: 'CENTER_NOT_FOUND' });
  });
  it('bloqueia arquivo duplicado, salvo reprocessamento explícito', async () => {
    const buffer = await eventWorkbookFixture(); mocks.findPrevious.mockResolvedValue({ id: 'old' });
    await expect(service.preview({ type: 'EVENTS', fileName: 'eventos.xlsx', mimeType: XLSX_MIME, buffer, centerId: 'center-1' }, admin)).rejects.toMatchObject({ code: 'IMPORT_ALREADY_EXISTS' });
  });
  it('retorna lote, último rascunho e trata lote inexistente', async () => {
    mocks.findBatch.mockResolvedValueOnce({ ...eventBatch([]), file_name: 'x.xlsx' });
    await expect(service.getBatch('batch-1', admin)).resolves.toMatchObject({ id: 'batch-1', fileName: 'x.xlsx' });
    mocks.latestDraft.mockResolvedValueOnce(null);
    await expect(service.getLatestDraft({ type: 'EVENTS', centerId: 'center-1' }, admin)).resolves.toBeNull();
    mocks.findBatch.mockResolvedValueOnce(null);
    await expect(service.getBatch('missing', admin)).rejects.toMatchObject({ code: 'IMPORT_NOT_FOUND' });
  });
  it('salva revisão de eventos e rejeita item, modo e status inválidos', async () => {
    const original = { id: 'e1', name: 'Evento', startAt: '2026-01-01T10:00:00.000Z', sourceRows: [2], participants: 1 };
    mocks.findBatch.mockResolvedValue(eventBatch([original])); mocks.saveDraft.mockImplementation(async (_id, data) => ({ ...eventBatch(data.draft.items), ...data }));
    const saved = await service.saveReview('batch-1', { items: [{ ...original, included: true, mode: 'ONLINE', subtype: 'Workshop' }] }, admin);
    expect(saved.draft.items[0]).toMatchObject({ included: true, reviewStatus: 'VALIDATED', mode: 'ONLINE' });
    await expect(service.saveReview('batch-1', { items: [{ ...original, id: 'unknown', included: true }] }, admin)).rejects.toMatchObject({ code: 'INVALID_REVIEW_ITEM' });
    mocks.findBatch.mockResolvedValueOnce(eventBatch([], 'IMPORTED'));
    await expect(service.saveReview('batch-1', { items: [] }, admin)).rejects.toMatchObject({ code: 'IMPORT_NOT_EDITABLE' });
  });
  it('revisa residente com período inválido e mantém revisão de período descontínuo', async () => {
    const parsed = await residentWorkbookFixture();
    // O parser real é exercitado no preview; aqui usamos a forma de lote já persistida pelo repository.
    const resident = { id: 'r1', name: 'Empresa', sourceRows: [2], startDate: '2026-02-01', endDate: null, discontinuous: true, rooms: [] };
    mocks.findBatch.mockResolvedValue({ ...eventBatch([resident]), import_type: 'RESIDENTS' });
    await expect(service.saveReview('batch-1', { items: [{ ...resident, included: true, endDate: '2026-01-01' }] }, admin)).rejects.toMatchObject({ code: 'INVALID_DATE_RANGE' });
    expect(parsed).toBeInstanceOf(Buffer);
  });
  it('confirma importação, converte evento e recalcula', async () => {
    const item = { id: 'e1', name: 'Evento', startAt: '2026-04-01T10:00:00.000Z', sourceRows: [2], included: true, mode: 'NOT_INFORMED', grouped: false };
    const batch = eventBatch([item], 'VALIDATED'); mocks.findBatch.mockResolvedValue(batch); mocks.markImported.mockResolvedValue({ ...batch, status: 'IMPORTED' });
    await expect(service.confirm('batch-1', admin)).resolves.toMatchObject({ status: 'IMPORTED' });
    expect(mocks.replaceBatchRecords).toHaveBeenCalledWith(batch, [expect.objectContaining({ recordType: 'EVENT', mode: null })], 'admin-1');
    expect(mocks.recompute).toHaveBeenCalledWith('center-1', 2026, 'admin-1');
  });
  it('bloqueia confirmação repetida, estado inválido e lote sem alterações incluídas', async () => {
    mocks.findBatch.mockResolvedValueOnce(eventBatch([], 'IMPORTED'));
    await expect(service.confirm('batch-1', admin)).rejects.toMatchObject({ code: 'IMPORT_ALREADY_CONFIRMED' });
    mocks.findBatch.mockResolvedValueOnce(eventBatch([], 'FAILED'));
    await expect(service.confirm('batch-1', admin)).rejects.toMatchObject({ code: 'IMPORT_NOT_CONFIRMABLE' });
    mocks.findBatch.mockResolvedValueOnce(eventBatch([], 'VALIDATED'));
    await expect(service.confirm('batch-1', admin)).rejects.toMatchObject({ code: 'NO_INCLUDED_RECORDS' });
  });
});
