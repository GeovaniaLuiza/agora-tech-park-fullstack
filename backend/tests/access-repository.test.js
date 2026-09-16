import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ pool: { connect: vi.fn() }, query: vi.fn() }));
vi.mock('../src/db/pool.js', () => database);

import { setRole, setStatus } from '../src/repositories/accessRepository.js';

const targetId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const operations = [
  ['inativação', (audit) => setStatus(targetId, 'INACTIVE', null, audit)],
  ...['GESTOR', 'PESQUISADOR', 'RESIDENTE'].map((role) => [role, (audit) => setRole(targetId, role, audit)]),
];
let client;
let admins;
let updated;
let audit;

beforeEach(() => {
  vi.clearAllMocks();
  admins = [{ id: targetId, is_target: true }];
  updated = { id: targetId };
  client = { release: vi.fn(), query: vi.fn(async (sql) => {
    if (sql.includes('FOR UPDATE')) return { rows: admins };
    if (sql.startsWith('UPDATE')) return { rows: updated ? [updated] : [] };
    return { rows: [] };
  }) };
  database.pool.connect.mockResolvedValue(client);
  audit = vi.fn(async (connection) => connection.query('AUDIT'));
});

describe('proteção transacional dos administradores', () => {
  it.each(operations)('bloqueia %s do único administrador antes do UPDATE', async (_name, mutate) => {
    await expect(mutate(audit)).rejects.toMatchObject({ code: 'LAST_ACTIVE_ADMIN' });
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN', expect.stringMatching(/WHERE role='ADMIN' AND status='ACTIVE' ORDER BY id FOR UPDATE/), 'ROLLBACK',
    ]);
    expect(audit).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
    expect(database.query).not.toHaveBeenCalled();
  });

  it.each(operations)('permite %s com outro administrador e audita antes do COMMIT', async (_name, mutate) => {
    admins.push({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' });
    expect(await mutate(audit)).toEqual(updated);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN', expect.stringContaining('ORDER BY id FOR UPDATE'), expect.stringMatching(/^UPDATE users/), 'AUDIT', 'COMMIT',
    ]);
    expect(audit).toHaveBeenCalledExactlyOnceWith(client);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each(operations)('permite %s de usuário que não é ADMIN ACTIVE', async (_name, mutate) => {
    admins = [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }];
    await expect(mutate(audit)).resolves.toEqual(updated);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it.each(operations)('reverte %s quando a auditoria falha', async (_name, mutate) => {
    admins.push({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' });
    const error = new Error('audit failed');
    audit.mockRejectedValueOnce(error);
    await expect(mutate(audit)).rejects.toBe(error);
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each(operations)('não audita %s quando o alvo não existe', async (_name, mutate) => {
    admins = [];
    updated = null;
    await expect(mutate(audit)).resolves.toBeNull();
    expect(audit).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it.each([
    ['ativação', (callback) => setStatus(targetId, 'ACTIVE', null, callback)],
    ['perfil ADMIN', (callback) => setRole(targetId, 'ADMIN', callback)],
  ])('preserva %s sem bloquear administradores', async (_name, mutate) => {
    await expect(mutate(audit)).resolves.toEqual(updated);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN', expect.stringMatching(/^UPDATE users/), 'AUDIT', 'COMMIT',
    ]);
  });
});
