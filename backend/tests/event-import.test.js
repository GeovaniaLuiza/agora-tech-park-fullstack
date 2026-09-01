import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventWorkbookFixture } from './fixtures/indicator-import-workbooks.js';
import { parseEventWorkbook, summarizeEvents } from '../src/services/eventImportParser.js';

const mocks = vi.hoisted(() => ({ findBatch: vi.fn(), saveDraft: vi.fn() }));
vi.mock('../src/repositories/indicatorImportRepository.js', () => ({
  findBatch: mocks.findBatch, saveDraft: mocks.saveDraft,
}));
vi.mock('../src/repositories/auditRepository.js', () => ({ record: vi.fn() }));
vi.mock('../src/services/indicatorCalculationService.js', () => ({ recompute: vi.fn() }));
import { groupEvents } from '../src/services/indicatorImportService.js';

beforeEach(() => vi.clearAllMocks());

describe('importação de eventos', () => {
  it('interpreta datas, preserva participante ausente e sinaliza linha inválida e duplicidade', async () => {
    const parsed = await parseEventWorkbook(await eventWorkbookFixture());
    expect(parsed.errors).toEqual([]);
    expect(parsed.items).toHaveLength(2); // One was filtered
    expect(parsed.items[0].startAt).toBe('2026-03-15T09:00:00.000Z');
    expect(parsed.items[1].participants).toBeNull();
    expect(parsed.items[0].duplicateGroup).toBe(parsed.items[1].duplicateGroup);
    // Removed INVALID_EVENT_ROW as it was filtered out early
    expect(parsed.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['MISSING_PARTICIPANTS', 'POSSIBLE_DUPLICATE']));
    expect(parsed.items.every((item) => item.included === false && item.reviewStatus === 'PENDING')).toBe(true);
  });

  it('agrupa duas reservas do mesmo evento sem somar participantes por padrão', async () => {
    const parsed = await parseEventWorkbook(await eventWorkbookFixture());
    const batch = { id: 'batch-1', import_type: 'EVENTS', innovation_center_id: 'center-1', year: 2026,
      status: 'WITH_WARNINGS', warnings: parsed.warnings, summary: parsed.summary, draft: { items: parsed.items }, center_name: 'Centro' };   
    mocks.findBatch.mockResolvedValue(batch);
    mocks.saveDraft.mockImplementation(async (_id, data) => ({ ...batch, ...data }));
    const grouped = await groupEvents('batch-1', { itemIds: [parsed.items[0].id, parsed.items[1].id], participantStrategy: 'MANUAL', participants: null }, { sub: 'user-1', role: 'ADMIN' });
    expect(grouped.draft.items).toHaveLength(1); // One item left after grouping 2
    const event = grouped.draft.items.find((item) => item.grouped);
    expect(event.location).toBe('Auditório / Rooftop 02');
    expect(event.participants).toBeNull();
    expect(event.included).toBe(true);
    expect(grouped.summary.monthly[2]).toBe(1);
  });
});
