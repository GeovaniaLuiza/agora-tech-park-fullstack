import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), release: vi.fn(), read: vi.fn() }));
vi.mock('../src/db/pool.js', () => ({ pool: { connect: mocks.connect }, query: mocks.read }));
import { confirmedRecords, replaceBatchRecords } from '../src/repositories/indicatorImportRepository.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
});

describe('confirmação com revisão bloqueada na transação', () => {
  it('consulta somente registros ativos de batches confirmados, no centro e ano selecionados', async () => {
    mocks.read.mockResolvedValue({ rows: [{ id: 'confirmed-event' }] });
    expect(await confirmedRecords('center-1', 2027, 'EVENTS')).toEqual([{ id: 'confirmed-event' }]);
    const [sql, params] = mocks.read.mock.calls[0];
    expect(sql).toContain("b.status='IMPORTED'");
    expect(sql).toContain('r.active AND r.deleted_at IS NULL');
    expect(sql).toContain('EXTRACT(YEAR FROM r.event_at)=$2::int');
    expect(params).toEqual(['center-1', 2027, 'EVENTS']);
  });
  it('reconfirmar o batch não grava registros nem valores', async () => {
    mocks.query.mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'center-1' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'IMPORTED' }] });
    const finalize = vi.fn();
    await expect(replaceBatchRecords({ id: 'batch-1', innovation_center_id: 'center-1' }, [{ recordType: 'EVENT' }], 'admin-1', finalize)).rejects.toMatchObject({ code: 'IMPORT_ALREADY_CONFIRMED' });
    expect(finalize).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO indicator_records'), expect.anything());
    expect(mocks.query).toHaveBeenLastCalledWith('ROLLBACK');
  });
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
