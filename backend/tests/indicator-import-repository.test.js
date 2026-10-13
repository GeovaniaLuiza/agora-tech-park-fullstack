import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), release: vi.fn(), read: vi.fn() }));
vi.mock('../src/db/pool.js', () => ({ pool: { connect: mocks.connect }, query: mocks.read }));
import { cancelBatch, confirmedRecords, createBatch, latestDraft, replaceBatchRecords } from '../src/repositories/indicatorImportRepository.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
});

describe('retomada de importações', () => {
  it.each(['EVENTS', 'RESIDENTS'])('busca apenas o lote atual revisável de %s do centro, compartilhado entre gestores', async (importType) => {
    mocks.read.mockResolvedValue({ rows: [{ id: 'pending', status: 'VALIDATED' }] });
    expect(await latestDraft({ importType, centerId: 'center', userId: 'admin' })).toEqual({ id: 'pending', status: 'VALIDATED' });
    const [sql, params] = mocks.read.mock.calls[0];
    expect(sql).toContain('b.import_type=$1 AND b.innovation_center_id=$2 AND b.is_current');
    expect(sql).toContain("b.status IN ('REVIEW_PENDING','WITH_WARNINGS','VALIDATED')");
    expect(sql).not.toMatch(/IMPORTED|COMPLETED/);
    expect(sql).toContain('ORDER BY b.created_at DESC,b.updated_at DESC,b.id DESC LIMIT 1');
    expect(params).toEqual([importType, 'center']);
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
      .mockResolvedValueOnce({ rows: [{ status: 'VALIDATED', updated_at: batch.updated_at, is_current: true }] });
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
    ['estado inválido', { status: 'FAILED', is_current: true, updated_at: '2026-10-07T12:00:00Z' }],
    ['revisão alterada', { status: 'VALIDATED', is_current: true, updated_at: '2026-10-07T12:01:00Z' }],
    ['lote histórico', { status: 'VALIDATED', is_current: false, updated_at: '2026-10-07T12:00:00Z' }],
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
      'SELECT status,updated_at,is_current FROM indicator_import_batches WHERE id=$1 FOR UPDATE',
      'ROLLBACK',
    ]);
    expect(finalize).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});

describe('ciclo de vida do lote atual', () => {
  const data = { centerId: 'center', importType: 'EVENTS', draft: { items: [] }, summary: {}, warnings: [] };

  it.each(['EVENTS', 'RESIDENTS'].flatMap((type) => ['REVIEW_PENDING', 'WITH_WARNINGS', 'VALIDATED', 'PROCESSING'].map((status) => [type, status])))('bloqueia novo upload de %s com lote %s sem alterar o atual', async (importType, status) => {
    mocks.query.mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'center' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'active', status }] });
    await expect(createBatch({ ...data, importType })).rejects.toMatchObject({ status: 409, code: 'IMPORT_ACTIVE_EXISTS' });
    expect(mocks.query.mock.calls[2][1]).toEqual(['center', importType]);
    expect(mocks.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
    expect(mocks.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it.each(['EVENTS', 'RESIDENTS'].flatMap((type) => ['IMPORTED', 'CANCELLED', 'FAILED'].map((status) => [type, status])))('abre nova geração de %s depois de %s em uma transação', async (importType, status) => {
    mocks.query.mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'center' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'old', status }] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'new', is_current: true }] });
    expect(await createBatch({ ...data, importType })).toEqual({ id: 'new', is_current: true });
    expect(mocks.query.mock.calls[1]).toEqual(['SELECT id FROM innovation_centers WHERE id=$1 FOR UPDATE', ['center']]);
    expect(mocks.query.mock.calls[3][0]).toContain('SET is_current=FALSE');
    expect(mocks.query.mock.calls[3][1]).toEqual(['center', importType]);
    expect(mocks.query.mock.calls[4][0]).toContain('created_by,is_current');
    expect(mocks.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('descarta só o lote pendente atual, preserva dados e grava auditoria antes do commit', async () => {
    mocks.query.mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'active', status: 'CANCELLED', is_current: true }] });
    const audit = vi.fn();
    expect(await cancelBatch({ id: 'active', innovation_center_id: 'center' }, audit)).toMatchObject({ status: 'CANCELLED', is_current: true });
    expect(mocks.query.mock.calls[2][0]).toContain("WHERE id=$1 AND is_current AND status IN ('REVIEW_PENDING','WITH_WARNINGS','VALIDATED')");
    expect(mocks.query.mock.calls.map(([sql]) => sql).join(' ')).not.toMatch(/DELETE|indicator_records|indicator_values|SET is_current=FALSE/);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ query: mocks.query }));
    expect(audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.query.mock.invocationCallOrder.at(-1));
  });

  it('recusa descarte se outra requisição confirmou/substituiu o lote', async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    const audit = vi.fn();
    await expect(cancelBatch({ id: 'active', innovation_center_id: 'center' }, audit)).rejects.toMatchObject({ status: 409, code: 'IMPORT_NOT_CANCELLABLE' });
    expect(audit).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('falha de auditoria desfaz o descarte', async () => {
    mocks.query.mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'active', status: 'CANCELLED' }] });
    await expect(cancelBatch({ id: 'active', innovation_center_id: 'center' }, vi.fn().mockRejectedValue(new Error('audit')))).rejects.toThrow('audit');
    expect(mocks.query).toHaveBeenLastCalledWith('ROLLBACK');
  });
});
