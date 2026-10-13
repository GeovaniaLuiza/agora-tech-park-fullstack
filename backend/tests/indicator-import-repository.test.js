import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), release: vi.fn(), read: vi.fn() }));
vi.mock('../src/db/pool.js', () => ({ pool: { connect: mocks.connect }, query: mocks.read }));
import { confirmedRecords, latestDraft, replaceBatchRecords } from '../src/repositories/indicatorImportRepository.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
});

describe('retomada de importações', () => {
  it.each(['EVENTS', 'RESIDENTS'])('busca apenas lotes revisáveis de %s do usuário e centro selecionados', async (importType) => {
    mocks.read.mockResolvedValue({ rows: [{ id: 'pending', status: 'VALIDATED' }] });
    expect(await latestDraft({ importType, centerId: 'center', userId: 'admin' })).toEqual({ id: 'pending', status: 'VALIDATED' });
    const [sql, params] = mocks.read.mock.calls[0];
    expect(sql).toContain('b.import_type=$1 AND b.innovation_center_id=$2 AND b.created_by=$3');
    expect(sql).toContain("b.status IN ('REVIEW_PENDING','WITH_WARNINGS','VALIDATED')");
    expect(sql).not.toMatch(/IMPORTED|COMPLETED/);
    expect(sql).toContain('ORDER BY b.updated_at DESC LIMIT 1');
    expect(params).toEqual([importType, 'center', 'admin']);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('retorna vazio quando não existe lote pendente, sem modificar dados importados', async () => {
    mocks.read.mockResolvedValue({ rows: [] });
    expect(await latestDraft({ importType: 'EVENTS', centerId: 'center', userId: 'admin' })).toBeUndefined();
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(mocks.read.mock.calls[0][0]).toMatch(/^SELECT/);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});

describe('confirmação com revisão bloqueada na transação', () => {
  it('substitui reservas por chave estável ou ID original em arquivos diferentes e preserva Eventos antigos e Residentes', async () => {
    const batch = { id: 'batch', innovation_center_id: 'center', updated_at: '2026-10-01T00:00:00Z' };
    mocks.query.mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'VALIDATED', updated_at: batch.updated_at }] });
    await replaceBatchRecords(batch, [{ recordType: 'EVENT', sourceRows: [2, 3], extra: { sourceFormat: 'RESERVATIONS', sourceKey: 'stable', sourceIds: ['id-1', 'id-2'] } }], 'admin');
    const replacement = mocks.query.mock.calls.find(([sql]) => sql.includes("extra->>'sourceFormat'='RESERVATIONS'"));
    expect(replacement[0]).toContain("record_type='EVENT'");
    expect(replacement[0]).toContain('innovation_center_id=$1');
    expect(replacement[0]).toContain("extra->>'sourceKey'=$2 OR (extra->'sourceIds') ?| $3::text[]");
    expect(replacement[1]).toEqual(['center', 'stable', ['id-1', 'id-2'], 'admin']);
    expect(mocks.query).toHaveBeenLastCalledWith('COMMIT');
  });
  it('consulta somente registros ativos de batches confirmados, no centro e ano selecionados', async () => {
    mocks.read.mockResolvedValue({ rows: [{ id: 'confirmed-event' }] });
    expect(await confirmedRecords('center-1', 2027, 'EVENTS')).toEqual([{ id: 'confirmed-event' }]);
    const [sql, params] = mocks.read.mock.calls[0];
    expect(sql).toContain("b.status='IMPORTED'");
    expect(sql).toContain('r.active AND r.deleted_at IS NULL');
    expect(sql).toContain('EXTRACT(YEAR FROM r.event_at)=$2::int');
    expect(params).toEqual(['center-1', 2027, 'EVENTS', null]);
  });
  it.each([1, 7, 12])('aplica o mes %i ao detalhamento sem alterar a consulta anual', async (month) => {
    mocks.read.mockResolvedValue({ rows: [] });
    await confirmedRecords('center-1', 2026, 'EVENTS', month);
    const [sql, params] = mocks.read.mock.calls[0];
    expect(sql).toContain('r.innovation_center_id=$1');
    expect(sql).toContain('EXTRACT(YEAR FROM r.event_at)=$2::int');
    expect(sql).toContain("EXTRACT(MONTH FROM r.event_at AT TIME ZONE 'UTC')=$4::int");
    expect(sql).toContain('$4::int IS NULL');
    expect(params).toEqual(['center-1', 2026, 'EVENTS', month]);
    expect(mocks.connect).not.toHaveBeenCalled();
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
