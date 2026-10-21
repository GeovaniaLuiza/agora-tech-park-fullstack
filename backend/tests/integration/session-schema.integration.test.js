import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool, shutdown } from '../../src/db/pool.js';
import { assertSessionSchemaReady } from '../../src/config/sessionSchema.js';

const schema = `startup_test_${randomUUID().replaceAll('-', '')}`;
const migration = '022_user_session_version.sql';
const sql = await readFile(new URL(`../../../database/migrations/${migration}`, import.meta.url), 'utf8');
const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
let client;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL);
  if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error('Startup integration tests require a local disposable *_test database and NODE_ENV=test.');
  }
  client = await pool.connect();
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}, public`);
  await client.query('CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE schema_migrations(filename text PRIMARY KEY, checksum text NOT NULL)');
  await client.query('INSERT INTO users(id) VALUES($1)', [randomUUID()]);
});
beforeEach(() => { vi.spyOn(pool, 'query').mockImplementation((...args) => client.query(...args)); });
afterAll(async () => {
  vi.restoreAllMocks();
  if (client) { await client.query(`DROP SCHEMA ${schema} CASCADE`); client.release(); }
  await shutdown();
});

describe('migration 022 on an existing PostgreSQL account', () => {
  it('blocks startup before migration, preserves generation zero, and rejects schema drift', async () => {
    await expect(assertSessionSchemaReady()).rejects.toMatchObject({ code: 'SESSION_SCHEMA_NOT_READY' });
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations VALUES($1,$2)', [migration, checksum]);
    await client.query('COMMIT');
    expect((await client.query('SELECT session_version FROM users')).rows).toEqual([{ session_version: 0 }]);
    await expect(assertSessionSchemaReady()).resolves.toBeUndefined();
    // All drift simulations are rolled back in this disposable, isolated schema.
    for (const statement of [
      'ALTER TABLE users DROP COLUMN session_version',
      'ALTER TABLE users ALTER COLUMN session_version DROP NOT NULL',
      'ALTER TABLE users ALTER COLUMN session_version TYPE bigint',
      'ALTER TABLE users ALTER COLUMN session_version SET DEFAULT 1',
      "UPDATE schema_migrations SET checksum='incorrect'",
    ]) {
      await client.query('BEGIN');
      try {
        await client.query(statement);
        await expect(assertSessionSchemaReady()).rejects.toMatchObject({ code: 'SESSION_SCHEMA_NOT_READY' });
      } finally { await client.query('ROLLBACK'); }
      await expect(assertSessionSchemaReady()).resolves.toBeUndefined();
    }
  });
});
