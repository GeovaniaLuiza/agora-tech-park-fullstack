import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/db/pool.js', () => database);
import { assertSessionSchemaReady } from '../src/config/sessionSchema.js';

const checksum = createHash('sha256').update(await readFile(new URL('../../database/migrations/022_user_session_version.sql', import.meta.url), 'utf8')).digest('hex');
beforeEach(() => {
  vi.resetAllMocks();
  database.query.mockResolvedValueOnce({ rows: [{ migrations_table: 'schema_migrations' }] })
    .mockResolvedValueOnce({ rows: [{ checksum }] })
    .mockResolvedValueOnce({ rows: [{ valid: true }] });
});
describe('read-only session migration startup gate', () => {
  it('accepts the registered migration and a compatible column without writing to the database', async () => {
    await expect(assertSessionSchemaReady()).resolves.toBeUndefined();
    expect(database.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  });
  it.each([
    [{ rows: [{ migrations_table: null }] }],
    [{ rows: [{ migrations_table: 'schema_migrations' }] }, { rows: [] }],
    [{ rows: [{ migrations_table: 'schema_migrations' }] }, { rows: [{ checksum: 'incorrect' }] }],
    [{ rows: [{ migrations_table: 'schema_migrations' }] }, { rows: [{ checksum }] }, { rows: [] }],
    [{ rows: [{ migrations_table: 'schema_migrations' }] }, { rows: [{ checksum }] }, { rows: [{ valid: false }] }],
  ])('refuses missing/inconsistent migration metadata or schema: %j', async (...results) => {
    database.query.mockReset();
    for (const result of results) database.query.mockResolvedValueOnce(result);
    await expect(assertSessionSchemaReady()).rejects.toMatchObject({ code: 'SESSION_SCHEMA_NOT_READY' });
  });
  it('propagates database unavailability rather than permitting startup', async () => {
    const error = Object.assign(new Error('unavailable'), { code: 'ECONNREFUSED' });
    database.query.mockReset().mockRejectedValue(error);
    await expect(assertSessionSchemaReady()).rejects.toBe(error);
  });
});
