import { beforeEach, describe, expect, it, vi } from 'vitest';
import { residentWorkbookFixture } from './fixtures/indicator-import-workbooks.js';
import { XLSX_MIME } from '../src/domain/indicatorImportCatalog.js';

const mocks = vi.hoisted(() => ({
  repo: { findCenter: vi.fn(), findPrevious: vi.fn(), createBatch: vi.fn(), findBatch: vi.fn(), latestDraft: vi.fn(), saveDraft: vi.fn(), replaceBatchRecords: vi.fn(), markImported: vi.fn() },
  audit: vi.fn(), recompute: vi.fn(),
}));
vi.mock('../src/repositories/indicatorImportRepository.js', () => mocks.repo);
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.audit }));
vi.mock('../src/services/indicatorCalculationService.js', () => ({ recompute: mocks.recompute }));

import * as service from '../src/services/indicatorImportService.js';

const admin = { sub: 'admin-1', role: 'ADMIN' };
const batch = (items = [], overrides = {}) => ({
  id: 'batch-1', import_type: 'EVENTS', file_name: 'arquivo.xlsx', file_hash: 'HASH', innovation_center_id: 'center-1',
  center_name: 'Centro', year: 2026, status: 'WITH_WARNINGS', warnings: [], summary: {}, draft: { items }, ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repo.saveDraft.mockReset();
  mocks.repo.findCenter.mockResolvedValue({ id: 'center-1', name: 'Centro' });
  mocks.audit.mockResolvedValue();
  mocks.recompute.mockResolvedValue();
});

describe('indicatorImportService lote 5', () => {
  it('valida MIME, arquivo vazio, tamanho e assinatura XLSX', async () => {
    const valid = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    await expect(service.preview({ type: 'EVENTS', fileName: 'x.xlsx', mimeType: 'text/plain', buffer: valid }, admin)).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
    await expect(service.preview({ type: 'EVENTS', fileName: 'x.xlsx', mimeType: XLSX_MIME, buffer: Buffer.alloc(0) }, admin)).rejects.toMatchObject({ code: 'EMPTY_FILE' });
    await expect(service.preview({ type: 'EVENTS', fileName: 'x.xlsx', mimeType: XLSX_MIME, buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }, admin)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    await expect(service.preview({ type: 'EVENTS', fileName: 'x.xlsx', mimeType: XLSX_MIME, buffer: Buffer.from('nao-xlsx') }, admin)).rejects.toMatchObject({ code: 'INVALID_XLSX_SIGNATURE' });
  });

  it('converte planilha XLSX corrompida em erro de dominio', async () => {
    const corrupt = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await expect(service.preview({ type: 'EVENTS', fileName: 'x.xlsx', mimeType: XLSX_MIME, buffer: corrupt, centerId: 'center-1' }, admin)).rejects.toMatchObject({ code: 'INVALID_XLSX', status: 422 });
  });

  it('permite reprocessar duplicidade e cria preview de residentes', async () => {
    const buffer = await residentWorkbookFixture();
    mocks.repo.findPrevious.mockResolvedValue({ id: 'anterior' });
    mocks.repo.createBatch.mockImplementation(async (data) => batch(data.draft.items, { import_type: data.importType, status: data.status, warnings: data.warnings, summary: data.summary, file_name: data.fileName }));
    const result = await service.preview({ type: 'RESIDENTS', fileName: 'residentes.xlsx', mimeType: XLSX_MIME, buffer, centerId: 'center-1', reprocess: true }, admin);
    expect(result.importType).toBe('RESIDENTS');
    expect(mocks.repo.createBatch).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({ filters: { onlyInnovationBlocks: true } }) }));
  });

  it('retorna ultimo rascunho existente', async () => {
    mocks.repo.latestDraft.mockResolvedValue(batch([], { status: 'REVIEW_PENDING' }));
    await expect(service.getLatestDraft({ type: 'events', centerId: 'center-1' }, admin)).resolves.toMatchObject({ id: 'batch-1', status: 'REVIEW_PENDING' });
  });

  it('valida formato, modo e subtipo na revisao de eventos', async () => {
    const original = { id: 'e1', name: 'Evento', startAt: '2026-01-01T10:00:00.000Z', sourceRows: [2], duplicateKey: 'demo', participants: 1 };
    mocks.repo.findBatch.mockResolvedValue(batch([original]));
    await expect(service.saveReview('batch-1', { items: 'invalidos' }, admin)).rejects.toMatchObject({ code: 'INVALID_REVIEW' });
    await expect(service.saveReview('batch-1', { items: [{ ...original, mode: 'INVALIDO' }] }, admin)).rejects.toMatchObject({ code: 'INVALID_EVENT_MODE' });
    await expect(service.saveReview('batch-1', { items: [{ ...original, subtype: 'INVALIDO' }] }, admin)).rejects.toMatchObject({ code: 'INVALID_EVENT_SUBTYPE' });
  });

  it('revisa evento excluido e trata conflito concorrente ao salvar', async () => {
    const original = { id: 'e1', name: 'Evento', startAt: '2026-01-01T10:00:00.000Z', sourceRows: [2], participants: 1 };
    mocks.repo.findBatch.mockResolvedValue(batch([original]));
    mocks.repo.saveDraft.mockResolvedValueOnce(batch([{ ...original, included: false, reviewStatus: 'EXCLUDED' }])).mockResolvedValueOnce(null);
    await expect(service.saveReview('batch-1', { items: [{ ...original, included: false, reviewStatus: 'EXCLUDED', participants: '' }] }, admin)).resolves.toMatchObject({ id: 'batch-1' });
    expect(mocks.repo.saveDraft).toHaveBeenLastCalledWith('batch-1', expect.objectContaining({ draft: { items: [expect.objectContaining({ reviewStatus: 'EXCLUDED', participants: null })] } }));
    await expect(service.saveReview('batch-1', { items: [{ ...original, included: true }] }, admin)).rejects.toMatchObject({ code: 'IMPORT_NOT_EDITABLE', status: 409 });
  });

  it('revisa residente com overrides e valores decimais brasileiros', async () => {
    const original = { id: 'r1', name: 'Empresa', sourceRows: [2], startDate: '2026-01-01', endDate: null, discontinuous: true, rooms: ['1'], contracts: [] };
    mocks.repo.findBatch.mockResolvedValue(batch([original], { import_type: 'RESIDENTS' }));
    mocks.repo.saveDraft.mockImplementation(async (_id, data) => batch(data.draft.items, { import_type: 'RESIDENTS', status: data.status, summary: data.summary }));
    const saved = await service.saveReview('batch-1', { items: [{ ...original, included: true, manualPeriodOverride: true, rooms: [' 2 ', ''], fundsRaised: '10,5', annualRevenue: 20 }] }, admin);
    expect(saved.draft.items[0]).toMatchObject({ discontinuous: false, rooms: ['2'], fundsRaised: 10.5, annualRevenue: 20, reviewStatus: 'VALIDATED' });
  });

  it('valida agrupamento e estrategias de participantes', async () => {
    mocks.repo.findBatch.mockResolvedValueOnce(batch([], { import_type: 'RESIDENTS' }));
    await expect(service.groupEvents('batch-1', { itemIds: [] }, admin)).rejects.toMatchObject({ code: 'INVALID_IMPORT_TYPE' });
    const items = [
      { id: 'e1', name: 'Demo', duplicateKey: 'same', sourceRows: [3], participants: 2, location: 'A' },
      { id: 'e2', name: 'Demo', duplicateKey: 'same', sourceRows: [2], participants: 3, location: 'B' },
    ];
    mocks.repo.findBatch.mockResolvedValue(batch(items));
    await expect(service.groupEvents('batch-1', { itemIds: ['e1', 'e2'], participantStrategy: 'INVALID' }, admin)).rejects.toMatchObject({ code: 'INVALID_PARTICIPANT_STRATEGY' });
  });

  it('agrupa eventos com MAX e SUM e consolida local e linhas', async () => {
    const items = [
      { id: 'e1', name: 'Demo', duplicateKey: 'same', sourceRows: [3], participants: 2, location: 'A', included: true },
      { id: 'e2', name: 'Demo', duplicateKey: 'same', sourceRows: [2], participants: 3, location: 'B', included: true },
    ];
    mocks.repo.findBatch.mockResolvedValue(batch(items));
    mocks.repo.saveDraft.mockImplementation(async (_id, data) => batch(data.draft.items, { status: data.status, summary: data.summary }));
    const max = await service.groupEvents('batch-1', { itemIds: ['e1', 'e2'], participantStrategy: 'MAX' }, admin);
    expect(max.draft.items[0]).toMatchObject({ participants: 3, location: 'A / B', sourceRows: [2, 3], grouped: true });
    const sum = await service.groupEvents('batch-1', { itemIds: ['e1', 'e2'], participantStrategy: 'SUM' }, admin);
    expect(sum.draft.items[0].participants).toBe(5);
  });

  it('confirma residentes convertendo campos opcionais e ignorando excluidos', async () => {
    const included = { id: 'r1', name: 'Empresa', included: true, location: 'HUB', rooms: ['101'], contractType: '', startDate: '2026-01-01', endDate: null, sourceRows: [2], contracts: [], discontinuous: false };
    const excluded = { ...included, id: 'r2', included: false };
    const residentBatch = batch([included, excluded], { import_type: 'RESIDENTS', status: 'VALIDATED' });
    mocks.repo.findBatch.mockResolvedValue(residentBatch);
    mocks.repo.markImported.mockResolvedValue({ ...residentBatch, status: 'IMPORTED' });
    await service.confirm('batch-1', admin);
    expect(mocks.repo.replaceBatchRecords).toHaveBeenCalledWith(residentBatch, [expect.objectContaining({ recordType: 'RESIDENT_COMPANY', location: 'HUB - Salas 101', subtype: null })], 'admin-1');
    expect(mocks.repo.markImported).toHaveBeenCalledWith('batch-1', expect.objectContaining({ imported: 1, ignored: 1 }));
  });
});
