import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), release: vi.fn() }));
vi.mock('../src/db/pool.js', () => ({ pool: { connect: mocks.connect }, query: vi.fn() }));
import { replaceBatchRecords } from '../src/repositories/indicatorImportRepository.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
});

describe('confirmação com revisão bloqueada na transação', () => {
  it.each([
    ['lote inexistente', undefined],
    ['estado inválido', { status: 'FAILED', updated_at: '2026-10-07T12:00:00Z' }],
    ['revisão alterada', { status: 'VALIDATED', updated_at: '2026-10-07T12:01:00Z' }],
  ])('rejeita %s sem gravar registros nem finalizar', async (_scenario, locked) => {
    mocks.query.mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'center-1' }] })
      .mockResolvedValueOnce({ rows: locked ? [locked] : [] });
    const finalize = vi.fn();
    await expect(replaceBatchRecords({
      id: 'batch-1', innovation_center_id: 'center-1', updated_at: '2026-10-07T12:00:00Z',
    }, [{ recordType: 'EVENT' }], 'admin-1', finalize)).rejects.toMatchObject({
      status: 409, code: 'IMPORT_NOT_CONFIRMABLE',
    });
    expect(mocks.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'SELECT id FROM innovation_centers WHERE id=$1 FOR UPDATE',
      'SELECT status,updated_at FROM indicator_import_batches WHERE id=$1 FOR UPDATE',
      'ROLLBACK',
    ]);
    expect(finalize).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
