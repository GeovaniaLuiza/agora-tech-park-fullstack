import { beforeEach, describe, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('../src/db/pool.js', () => database);
import { findAuthenticationProfile, findPublicProfile, revokeSessions } from '../src/repositories/userRepository.js';
import { consume } from '../src/repositories/passwordResetRepository.js';
let client;
beforeEach(() => {
  vi.resetAllMocks();
  client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }), release: vi.fn() };
  database.pool.connect.mockResolvedValue(client);
});
describe('transactional session persistence', () => {
  it('loads generation internally while public profile queries omit it', async () => {
    database.query.mockResolvedValueOnce({ rows: [{ id: 'u', session_version: 3 }] }).mockResolvedValueOnce({ rows: [] });
    expect(await findAuthenticationProfile('u')).toMatchObject({ session_version: 3 });
    expect(database.query.mock.calls[0][0]).toContain('u.deleted_at IS NULL');
    database.query.mockReset().mockResolvedValue({ rows: [] });
    await findPublicProfile('u');
    expect(database.query.mock.calls[0][0]).not.toContain('session_version');
    expect(await findAuthenticationProfile('deleted')).toBeNull();
  });
  it('commits revocation and audit in the same transaction', async () => {
    const audit = vi.fn();
    await revokeSessions('u', 2, audit);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('session_version=$2'), ['u', 2]);
    expect(audit).toHaveBeenCalledWith(client);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
  it('does not increment a newer generation on delayed/repeated logout', async () => {
    client.query.mockResolvedValue({ rowCount: 0 });
    const audit = vi.fn();
    await revokeSessions('u', 2, audit);
    expect(audit).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });
  it('rolls revocation back if audit fails', async () => {
    await expect(revokeSessions('u', 2, async () => { throw new Error('audit failed'); })).rejects.toThrow('audit failed');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
  it('changes password and revokes sessions together, rolling both back on failure', async () => {
    client.query.mockImplementation(async (sql) => sql.startsWith('SELECT') ? { rows: [{ id: 'reset', user_id: 'u', expires_at: new Date(Date.now() + 60000) }] } : { rows: [] });
    await expect(consume('reset-token', 'new-hash', async () => { throw new Error('audit failed'); })).rejects.toThrow('audit failed');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('password_hash=$1,session_version=session_version+1'), ['new-hash', 'u']);
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });
  it.each(['INVALID', 'USED', 'EXPIRED'])('does not change credentials for a %s reset', async (state) => {
    const row = { id: 'reset', user_id: 'u', expires_at: new Date(Date.now() + 60000) };
    if (state === 'USED') row.used_at = new Date();
    if (state === 'EXPIRED') row.expires_at = new Date(0);
    client.query.mockImplementation(async (sql) => sql.startsWith('SELECT') ? { rows: state === 'INVALID' ? [] : [row] } : { rows: [] });
    expect(await consume('reset-token', 'new-hash', vi.fn())).toEqual({ state });
    expect(client.query.mock.calls.some(([sql]) => sql.includes('UPDATE users'))).toBe(false);
  });
});
