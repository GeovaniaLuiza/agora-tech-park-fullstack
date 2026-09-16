import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { pool, shutdown } from '../../src/db/pool.js';
import { setRole, setStatus } from '../../src/repositories/accessRepository.js';
import { record } from '../../src/repositories/auditRepository.js';
import { deleteUser } from '../../src/services/accessService.js';

// Use real PostgreSQL tables in an isolated schema, without touching existing users.
const schema = `admin_guard_${randomUUID().replaceAll('-', '')}`;
const firstId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const secondId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
let setup;
let connectionSpy;
const audit = (id, action) => (client) => record({ action, entityId: id }, client);
const mutations = {
  status: (id, callback) => setStatus(id, 'INACTIVE', null, callback),
  role: (id, callback) => setRole(id, 'GESTOR', callback),
};

beforeAll(async () => {
  setup = await pool.connect();
  await setup.query(`CREATE SCHEMA ${schema}`);
  await setup.query(`SET search_path TO ${schema}, public`);
  await setup.query(`CREATE TABLE users (LIKE public.users INCLUDING ALL)`);
  await setup.query(`CREATE TABLE audit_logs (LIKE public.audit_logs INCLUDING ALL)`);
});

beforeEach(async () => {
  // Route service reads to the same isolated schema, using real PostgreSQL queries.
  vi.spyOn(pool, 'query').mockImplementation((...args) => setup.query(...args));
  const connect = pool.connect.bind(pool);
  connectionSpy = vi.spyOn(pool, 'connect').mockImplementation(async () => {
    const client = await connect();
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query("SELECT set_config('application_name', $1, false)", [schema]);
    await client.query("SET statement_timeout = '5s'");
    return client;
  });
  await setup.query('TRUNCATE audit_logs, users');
  await setup.query(`INSERT INTO users(id,name,email,password_hash,role,status)
    VALUES($1,'Admin A','a@test.invalid','test','ADMIN','ACTIVE'),
          ($2,'Admin B','b@test.invalid','test','ADMIN','ACTIVE')`, [firstId, secondId]);
});

afterAll(async () => {
  connectionSpy?.mockRestore();
  if (setup) {
    await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    setup.release();
  }
  await shutdown();
});

describe('último ADMIN ACTIVE no PostgreSQL', () => {
  it.each(['2025-01-15T10:30:00.123Z', null])('preserva inactivated_at=%s ao excluir uma conta já INACTIVE', async (inactivatedAt) => {
    await setup.query("UPDATE users SET status='INACTIVE', inactivated_at=$2 WHERE id=$1", [secondId, inactivatedAt]);

    await deleteUser(secondId, { sub: firstId });

    const { rows } = await setup.query('SELECT status,inactivated_at FROM users WHERE id=$1', [secondId]);
    expect(rows).toEqual([{ status: 'INACTIVE', inactivated_at: inactivatedAt ? new Date(inactivatedAt) : null }]);
    expect((await setup.query('SELECT action,entity_id,details FROM audit_logs')).rows).toEqual([
      { action: 'USER_DELETED', entity_id: secondId, details: { logical: true } },
    ]);
  });

  it('define a data ao inativar uma conta ACTIVE', async () => {
    const { rows: [before] } = await setup.query('SELECT clock_timestamp() AS time');
    await setStatus(secondId, 'INACTIVE', firstId, audit(secondId, 'USER_INACTIVATED'));
    const { rows: [after] } = await setup.query('SELECT status,inactivated_at,clock_timestamp() AS time FROM users WHERE id=$1', [secondId]);
    expect(after.status).toBe('INACTIVE');
    expect(after.inactivated_at).toBeInstanceOf(Date);
    expect(after.inactivated_at.getTime()).toBeGreaterThanOrEqual(before.time.getTime());
    expect(after.inactivated_at.getTime()).toBeLessThanOrEqual(after.time.getTime());
  });

  it.each(['ACTIVE', 'INACTIVE', 'PENDING', 'EMAIL_PENDING', 'REJECTED'])('limpa inactivated_at ao mudar %s para ACTIVE', async (status) => {
    await setup.query('UPDATE users SET status=$2,inactivated_at=$3 WHERE id=$1', [secondId, status, '2025-01-15T10:30:00.123Z']);
    await setStatus(secondId, 'ACTIVE', firstId, audit(secondId, 'USER_ACTIVATED'));
    expect((await setup.query('SELECT status,inactivated_at FROM users WHERE id=$1', [secondId])).rows).toEqual([
      { status: 'ACTIVE', inactivated_at: null },
    ]);
  });

  it.each([firstId.toUpperCase(), firstId.replaceAll('-', '')])('bloqueia também a representação UUID %s', async (userId) => {
    await setup.query('DELETE FROM users WHERE id=$1', [secondId]);
    await expect(setStatus(userId, 'INACTIVE', null, audit(userId, 'USER_INACTIVATED'))).rejects.toMatchObject({ code: 'LAST_ACTIVE_ADMIN' });
    expect((await setup.query('SELECT * FROM audit_logs')).rowCount).toBe(0);
  });

  it.each(['status', 'role'])('bloqueia o último administrador em %s sem auditoria', async (operation) => {
    await setup.query('DELETE FROM users WHERE id=$1', [secondId]);
    await expect(mutations[operation](firstId, audit(firstId, 'ROLE_CHANGED'))).rejects.toMatchObject({ code: 'LAST_ACTIVE_ADMIN' });
    expect((await setup.query('SELECT role,status FROM users')).rows).toEqual([{ role: 'ADMIN', status: 'ACTIVE' }]);
    expect((await setup.query('SELECT * FROM audit_logs')).rowCount).toBe(0);
  });

  it.each(['status', 'role'])('reverte UPDATE e auditoria em %s se o callback falhar', async (operation) => {
    await expect(mutations[operation](firstId, async (client) => {
      await audit(firstId, 'USER_INACTIVATED')(client);
      throw new Error('audit failed');
    })).rejects.toThrow('audit failed');
    expect((await setup.query("SELECT id FROM users WHERE role='ADMIN' AND status='ACTIVE'")).rowCount).toBe(2);
    expect((await setup.query('SELECT * FROM audit_logs')).rowCount).toBe(0);
  });

  it.each([
    ['status', 'status'], ['role', 'role'], ['status', 'role'], ['role', 'status'],
  ])('serializa %s e %s concorrentes e mantém um administrador', async (firstOperation, secondOperation) => {
    let releaseFirst;
    let enteredAudit;
    const gate = new Promise((resolve) => { releaseFirst = resolve; });
    const entered = new Promise((resolve) => { enteredAudit = resolve; });
    const first = mutations[firstOperation](firstId, async (client) => {
      await audit(firstId, firstOperation === 'status' ? 'USER_INACTIVATED' : 'ROLE_CHANGED')(client);
      enteredAudit();
      await gate;
    });
    let second;
    // Attach handlers immediately so failures cannot become unhandled rejections.
    const firstResult = Promise.allSettled([first]);
    let secondResult;
    try {
      await Promise.race([entered, first.then(() => { throw new Error('Missing audit callback'); })]);
      second = mutations[secondOperation](secondId, audit(secondId, 'USER_DELETED'));
      secondResult = Promise.allSettled([second]);
      // Prove that the second transaction is waiting for the first one's row locks.
      const deadline = Date.now() + 3000;
      let waiting = false;
      while (Date.now() < deadline && !waiting) {
        const { rows } = await setup.query(`SELECT 1 FROM pg_stat_activity
          WHERE application_name=$1 AND wait_event_type='Lock'`, [schema]);
        waiting = rows.length > 0;
        if (!waiting) await setTimeout(20);
      }
      expect(waiting).toBe(true);
      releaseFirst();
      expect((await firstResult)[0].status).toBe('fulfilled');
      expect((await secondResult)[0]).toMatchObject({ status: 'rejected', reason: { code: 'LAST_ACTIVE_ADMIN' } });
      expect((await setup.query("SELECT id FROM users WHERE role='ADMIN' AND status='ACTIVE'")).rows).toEqual([{ id: secondId }]);
      expect((await setup.query('SELECT entity_id FROM audit_logs')).rows).toEqual([{ entity_id: firstId }]);
    } finally {
      releaseFirst();
      await firstResult;
      if (secondResult) await secondResult;
    }
  });
});
