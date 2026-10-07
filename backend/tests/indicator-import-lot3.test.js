import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventWorkbookFixture, residentWorkbookFixture } from './fixtures/indicator-import-workbooks.js';
import { XLSX_MIME } from '../src/domain/indicatorImportCatalog.js';

const mocks = vi.hoisted(() => ({ findCenter: vi.fn(), findPrevious: vi.fn(), createBatch: vi.fn(), findBatch: vi.fn(), latestDraft: vi.fn(), saveDraft: vi.fn(), withLockedBatch: vi.fn(), replaceBatchRecords: vi.fn(), markImported: vi.fn(), record: vi.fn(), recompute: vi.fn() }));
vi.mock('../src/repositories/indicatorImportRepository.js', () => mocks);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.record }));
vi.mock('../src/services/indicatorCalculationService.js', () => ({ recompute: mocks.recompute }));
import * as service from '../src/services/indicatorImportService.js';

const admin = { sub: 'admin-1', role: 'ADMIN' };
const eventBatch = (items, status = 'WITH_WARNINGS') => ({ id: 'batch-1', import_type: 'EVENTS', innovation_center_id: 'center-1', center_name: 'Centro', year: 2026, status, file_hash: 'HASH', warnings: [], summary: {}, draft: { items } });
beforeEach(() => { vi.clearAllMocks(); mocks.withLockedBatch.mockImplementation(async (id, callback) => callback(await mocks.findBatch(id), undefined)); mocks.findPrevious.mockReset(); mocks.findCenter.mockResolvedValue({ id: 'center-1', name: 'Centro' }); mocks.record.mockResolvedValue(); mocks.recompute.mockResolvedValue(); });

describe('importação de indicadores (RF-009)', () => {
  it('gera preview válido de eventos com aviso e persiste o rascunho', async () => {
    const buffer = await eventWorkbookFixture();
    mocks.createBatch.mockImplementation(async (data) => ({ id: 'batch-1', import_type: data.importType, file_name: data.fileName, file_hash: data.fileHash, innovation_center_id: data.centerId, year: data.year, status: data.status, summary: data.summary, warnings: data.warnings, draft: data.draft }));
    const preview = await service.preview({ type: 'EVENTS', fileName: 'eventos.xlsx', mimeType: XLSX_MIME, buffer, centerId: 'center-1' }, admin);
    expect(preview.status).toBe('WITH_WARNINGS'); expect(preview.draft.items).toHaveLength(4);
    expect(mocks.createBatch).toHaveBeenCalledWith(expect.objectContaining({ totalRecords: 4, totalWarnings: expect.any(Number) }));
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
    const original = { id: 'e1', name: 'Evento', location: 'Auditório', startAt: '2026-01-01T10:00:00.000Z', sourceRows: [2], participants: 1 };
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
    const item = { id: 'e1', name: 'Evento', location: 'Auditório', startAt: '2026-04-01T10:00:00.000Z', sourceRows: [2], included: true, mode: 'NOT_INFORMED', grouped: false };
    const batch = eventBatch([item], 'VALIDATED'); mocks.findBatch.mockResolvedValue(batch); mocks.markImported.mockResolvedValue({ ...batch, status: 'IMPORTED' });
    await expect(service.confirm('batch-1', admin)).resolves.toMatchObject({ status: 'IMPORTED' });
    expect(mocks.replaceBatchRecords).toHaveBeenCalledWith(batch, [expect.objectContaining({ recordType: 'EVENT', mode: null })], 'admin-1', undefined);
    expect(mocks.recompute).toHaveBeenCalledWith('center-1', 2026, 'admin-1', undefined);
  });
  it('bloqueia confirmação repetida, estado inválido e lote sem alterações incluídas', async () => {
    mocks.findBatch.mockResolvedValueOnce(eventBatch([], 'IMPORTED'));
    await expect(service.confirm('batch-1', admin)).resolves.toMatchObject({ status: 'IMPORTED' });
    mocks.findBatch.mockResolvedValueOnce(eventBatch([], 'FAILED'));
    await expect(service.confirm('batch-1', admin)).rejects.toMatchObject({ code: 'IMPORT_NOT_CONFIRMABLE' });
    mocks.findBatch.mockResolvedValueOnce(eventBatch([], 'VALIDATED'));
    await expect(service.confirm('batch-1', admin)).rejects.toMatchObject({ code: 'NO_INCLUDED_RECORDS' });
  });
});


  it.each([
    ['EVENTS', 'Eventos.xlsx', 'Eventos', { records: 4 }, eventWorkbookFixture],
    ['RESIDENTS', 'Clientes.xlsx', 'Clientes', { rowsRead: 8, companies: 5, occupations: 6, ignored: 2 }, residentWorkbookFixture],
  ])('gera apenas draft do formato %s usando XLSX sintético', async (type, fileName, sheetName, summary, fixture) => {
    const buffer = await fixture();
    mocks.createBatch.mockImplementation(async (data) => ({
      id: 'synthetic-file-batch', import_type: data.importType, file_name: data.fileName,
      sheet_name: data.sheetName, file_size: data.fileSize, summary: data.summary, draft: data.draft,
    }));
    const result = await service.preview({ type, fileName, mimeType: XLSX_MIME, buffer, centerId: 'center-1' }, admin);
    expect(result).toMatchObject({ fileName, sheetName, fileSize: buffer.length, summary });
    expect(mocks.createBatch).toHaveBeenCalledOnce();
    expect(mocks.replaceBatchRecords).not.toHaveBeenCalled();
    expect(mocks.markImported).not.toHaveBeenCalled();
    expect(mocks.recompute).not.toHaveBeenCalled();
  });

  it('rejeita Eventos com aba incorreta antes de criar o draft', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await eventWorkbookFixture());
    workbook.getWorksheet('Eventos').name = 'Outra';
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(service.preview({ type: 'EVENTS', fileName: 'Eventos.xlsx', mimeType: XLSX_MIME, buffer, centerId: 'center-1' }, admin))
      .rejects.toMatchObject({ code: 'SHEET_NOT_FOUND', message: 'Aba "Eventos" não encontrada.' });
    expect(mocks.createBatch).not.toHaveBeenCalled();
    expect(mocks.replaceBatchRecords).not.toHaveBeenCalled();
    expect(mocks.recompute).not.toHaveBeenCalled();
  });

  it('upload e revisão gravam apenas draft, mantendo o registro definitivo para confirmar', async () => {
    const buffer = await eventWorkbookFixture();
    mocks.createBatch.mockImplementation(async (data) => ({ ...eventBatch(data.draft.items), import_type: data.importType, sheet_name: data.sheetName, file_size: data.fileSize, summary: data.summary, warnings: data.warnings }));
    const result = await service.preview({ type: 'EVENTS', fileName: 'Eventos.xlsx', mimeType: XLSX_MIME, buffer, centerId: 'center-1' }, admin);
    expect(result).toMatchObject({ sheetName: 'Eventos', fileSize: buffer.length });
    expect(mocks.replaceBatchRecords).not.toHaveBeenCalled();
    expect(mocks.recompute).not.toHaveBeenCalled();
    mocks.findBatch.mockResolvedValue(eventBatch(result.draft.items));
    mocks.saveDraft.mockImplementation(async (_id, data) => ({ ...eventBatch(data.draft.items), ...data }));
    const reviewed = result.draft.items.map((item, index) => ({ ...item, included: index === 0, reviewStatus: index === 0 ? 'VALIDATED' : 'EXCLUDED', theme: index === 0 ? 'Tecnologia revisada' : item.theme }));
    const saved = await service.saveReview('batch-1', { items: reviewed }, admin);
    expect(saved.draft.items[0]).toMatchObject({ theme: 'Tecnologia revisada', manuallyCorrected: true });
    expect(saved.summary).toMatchObject({ included: 1, reviewed: 4, corrected: 1 });
    expect(mocks.replaceBatchRecords).not.toHaveBeenCalled();
    expect(mocks.recompute).not.toHaveBeenCalled();
    const ready = { ...eventBatch(saved.draft.items), summary: saved.summary };
    mocks.findBatch.mockResolvedValue(ready);
    mocks.markImported.mockResolvedValue({ ...ready, status: 'IMPORTED' });
    await service.confirm('batch-1', admin);
    expect(mocks.replaceBatchRecords).toHaveBeenCalledWith(ready, [expect.objectContaining({ theme: 'Tecnologia revisada', participatingCompanies: 3 })], admin.sub, undefined);
    expect(mocks.recompute).toHaveBeenCalledTimes(1);
  });

  it('bloqueia problemas incluídos na confirmação, mas permite guardar a revisão incompleta', async () => {
    const { parseEventWorkbook } = await import('../src/services/eventImportParser.js');
    const parsed = await parseEventWorkbook(await eventWorkbookFixture());
    const pending = parsed.items.map((item, index) => ({ ...item, included: index === 3 }));
    mocks.findBatch.mockResolvedValue(eventBatch(pending));
    mocks.saveDraft.mockImplementation(async (_id, data) => ({ ...eventBatch(data.draft.items), ...data }));
    const saved = await service.saveReview('batch-1', { items: pending }, admin);
    expect(saved.draft.items[3].validationStatus).toBe('REVIEW_REQUIRED');
    mocks.findBatch.mockResolvedValue(eventBatch(saved.draft.items));
    await expect(service.confirm('batch-1', admin)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED', message: expect.stringContaining('linha 5') });
    expect(mocks.replaceBatchRecords).not.toHaveBeenCalled();
  });
  it('corrige CNPJ e ocupações e mantém ignorados fora da persistência', async () => {
    const { parseResidentWorkbook } = await import('../src/services/residentImportParser.js');
    const parsed = await parseResidentWorkbook(await residentWorkbookFixture());
    const original = { ...eventBatch(parsed.items), import_type: 'RESIDENTS' };
    mocks.findBatch.mockResolvedValue(original);
    mocks.saveDraft.mockImplementation(async (_id, data) => ({ ...original, ...data }));
    const submitted = parsed.items.map((item) => ({ ...item, included: item.name === 'Empresa Anônima A', reviewStatus: item.name === 'Empresa Anônima A' ? 'VALIDATED' : 'EXCLUDED', contracts: item.contracts.map((contract) => ({ ...contract, areaInput: item.name === 'Empresa Anônima A' ? '55,40' : contract.areaInput })) }));
    const saved = await service.saveReview('batch-1', { items: submitted }, admin);
    const ready = { ...original, draft: saved.draft, summary: saved.summary };
    mocks.findBatch.mockResolvedValue(ready);
    mocks.markImported.mockResolvedValue({ ...ready, status: 'IMPORTED' });
    await service.confirm('batch-1', admin);
    const record = mocks.replaceBatchRecords.mock.calls[0][1][0];
    expect(record.extra).toMatchObject({ document: '11222333000181', totalArea: 110.8 });
    expect(record.extra.contracts).toHaveLength(2);
    expect(mocks.replaceBatchRecords.mock.calls[0][1]).toHaveLength(1);
    expect(mocks.markImported).toHaveBeenCalledWith('batch-1', expect.objectContaining({ imported: 1, ignored: 6 }), undefined);
  });

  it('CNPJ ausente ou inválido permanece bloqueado até correção ou exclusão', async () => {
    const { parseResidentWorkbook } = await import('../src/services/residentImportParser.js');
    const parsed = await parseResidentWorkbook(await residentWorkbookFixture());
    mocks.findBatch.mockResolvedValue({ ...eventBatch(parsed.items), import_type: 'RESIDENTS' });
    await expect(service.confirm('batch-1', admin)).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    expect(mocks.replaceBatchRecords).not.toHaveBeenCalled();
  });

it('reconsolida após corrigir o CNPJ e preserva cada ocupação original', async () => {
  const { parseResidentWorkbook } = await import('../src/services/residentImportParser.js');
  const parsed = await parseResidentWorkbook(await residentWorkbookFixture());
  const original = { ...eventBatch(parsed.items), import_type: 'RESIDENTS' };
  mocks.findBatch.mockResolvedValue(original);
  mocks.saveDraft.mockImplementation(async (_id, data) => ({ ...original, ...data }));
  const submitted = parsed.items.map((item) => item.name === 'Empresa Sem Documento'
    ? { ...item, document: '11.222.333/0001-81' }
    : item);
  const saved = await service.saveReview('batch-1', { items: submitted }, admin);
  const company = saved.draft.items.find((item) => item.document === '11222333000181');
  expect(company.sourceRows).toEqual([3, 4, 7, 8]);
  expect(company.contracts).toHaveLength(4);
  expect(company.totalArea).toBe(200);
  expect(company.validationStatus).toBe('VALID');
  expect(saved.summary.occupations).toBe(6);
  expect(mocks.replaceBatchRecords).not.toHaveBeenCalled();
});

it('preserva Disponível e Áreas Comuns como ignorados mesmo se a revisão tentar incluí-los', async () => {
  const { parseResidentWorkbook } = await import('../src/services/residentImportParser.js');
  const parsed = await parseResidentWorkbook(await residentWorkbookFixture());
  const original = { ...eventBatch(parsed.items), import_type: 'RESIDENTS' };
  mocks.findBatch.mockResolvedValue(original);
  mocks.saveDraft.mockImplementation(async (_id, data) => ({ ...original, ...data }));
  const saved = await service.saveReview('batch-1', { items: parsed.items.map((item) => ({ ...item, included: true, ignored: false, reviewStatus: 'VALIDATED' })) }, admin);
  const ignored = saved.draft.items.filter((item) => item.ignored);
  expect(ignored).toHaveLength(2);
  expect(ignored.every((item) => !item.included && item.validationStatus === 'IGNORED')).toBe(true);
});

  it.each([
    ['RESIDENTS', 'Eventos.xlsx', 'Clientes', eventWorkbookFixture],
  ])('rejeita a planilha do outro fluxo em %s antes de criar o draft', async (type, fileName, sheetName, fixture) => {
    const buffer = await fixture();
    await expect(service.preview({ type, fileName, mimeType: XLSX_MIME, buffer, centerId: 'center-1' }, admin))
      .rejects.toMatchObject({ code: 'SHEET_NOT_FOUND', message: `Aba "${sheetName}" não encontrada.` });
    expect(mocks.createBatch).not.toHaveBeenCalled();
    expect(mocks.replaceBatchRecords).not.toHaveBeenCalled();
    expect(mocks.recompute).not.toHaveBeenCalled();
  });
