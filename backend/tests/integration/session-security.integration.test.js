import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/app.js';
import { pool, shutdown } from '../../src/db/pool.js';
import { issue, consume } from '../../src/repositories/passwordResetRepository.js';
import { revokeSessions } from '../../src/repositories/userRepository.js';

const schema = `session_test_${randomUUID().replaceAll('-', '')}`;
const id = randomUUID();
const email = `${id}@session.invalid`;
const password = 'Session-Password-123!';
let setup;
let hash;
const login = (value = password) => request(app).post('/api/auth/login').send({ email, password: value });
const me = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
const logout = (token) => request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
const sign = (version = 0, options = {}) => jwt.sign({ sub: id, sv: version }, process.env.JWT_SECRET, { expiresIn: '1h', ...options });
const version = async () => (await setup.query('SELECT session_version FROM users WHERE id=$1', [id])).rows[0].session_version;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL);
  if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error('Session integration tests require NODE_ENV=test and a local disposable *_test database.');
  }
  hash = await bcrypt.hash(password, 4);
  setup = await pool.connect();
  await setup.query(`CREATE SCHEMA ${schema}`);
  await setup.query(`SET search_path TO ${schema}, public`);
  for (const table of ['users', 'organizations', 'users_organizations', 'audit_logs', 'password_reset_tokens']) {
    await setup.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  }
});

beforeEach(async () => {
  vi.spyOn(pool, 'query').mockImplementation((...args) => setup.query(...args));
  const connect = pool.connect.bind(pool);
  vi.spyOn(pool, 'connect').mockImplementation(async () => {
    const client = await connect();
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query("SET statement_timeout = '5s'");
    return client;
  });
  await setup.query('TRUNCATE users, organizations, users_organizations, audit_logs, password_reset_tokens');
  await setup.query(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at)
    VALUES($1,'Session Admin',$2,$3,'ADMIN','ACTIVE',NOW())`, [id, email, hash]);
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (setup) {
    await setup.query(`DROP SCHEMA ${schema} CASCADE`);
    setup.release();
  }
  await shutdown();
});

describe('PostgreSQL-backed JWT lifecycle', () => {
  it('persists logout, invalidates both account tokens and accepts a fresh login', async () => {
    const first = await login(); const second = await login();
    expect(first.status).toBe(200);
    expect(first.body.token).not.toBe(second.body.token);
    expect(first.body.user).not.toHaveProperty('session_version');
    await me(first.body.token).expect(200);
    await logout(first.body.token).expect(204);
    expect(await version()).toBe(1);
    await me(first.body.token).expect(401);
    await me(second.body.token).expect(401);
    await logout(first.body.token).expect(401);
    const fresh = await login();
    expect(jwt.verify(fresh.body.token, process.env.JWT_SECRET).sv).toBe(1);
    await me(fresh.body.token).expect(200);
    // Simulate two logout requests that authenticated before either committed.
    await revokeSessions(id, 0, async () => { throw new Error('must not audit an old generation'); });
    expect(await version()).toBe(1);
    await me(fresh.body.token).expect(200);
    const audit = await setup.query("SELECT action FROM audit_logs WHERE action='USER_LOGOUT'");
    expect(audit.rowCount).toBe(1);
  });

  it('atomically invalidates all old sessions on reset; only the new password logs in', async () => {
    const first = await login(); const second = await login();
    const reset = await issue(id);
    const newPassword = 'Changed-Password-456!';
    await request(app).post('/api/auth/reset-password').send({ token: reset.rawToken, password: newPassword, confirmPassword: newPassword }).expect(200);
    expect(await version()).toBe(1);
    await me(first.body.token).expect(401);
    await me(second.body.token).expect(401);
    await login().expect(401);
    const fresh = await login(newPassword);
    expect(fresh.status).toBe(200);
    await me(fresh.body.token).expect(200);
    await request(app).post('/api/auth/reset-password').send({ token: reset.rawToken, password: newPassword, confirmPassword: newPassword }).expect(409);
    expect(await version()).toBe(1);
  });

  it('rolls back password, reset consumption and revocation together on audit failure', async () => {
    const reset = await issue(id);
    await expect(consume(reset.rawToken, 'uncommitted-hash', async () => { throw new Error('audit failed'); })).rejects.toThrow('audit failed');
    expect(await version()).toBe(0);
    expect((await setup.query('SELECT password_hash FROM users WHERE id=$1', [id])).rows[0].password_hash).toBe(hash);
    expect((await setup.query('SELECT used_at FROM password_reset_tokens')).rows[0].used_at).toBeNull();
    await expect(revokeSessions(id, 0, async () => { throw new Error('audit failed'); })).rejects.toThrow('audit failed');
    expect(await version()).toBe(0);
  });

  it('rejects expired/forged JWTs and a legacy JWT after revocation', async () => {
    const expired = await me(sign(0, { expiresIn: '-1s' })).expect(401);
    expect(expired.body).toMatchObject({ code: 'TOKEN_EXPIRED' });
    const forged = jwt.sign({ sub: id, sv: 0 }, 'another-secret', { expiresIn: '1h' });
    const invalid = await me(forged).expect(401);
    expect(invalid.body).toMatchObject({ code: 'INVALID_TOKEN' });
    const legacy = jwt.sign({ sub: id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const authenticated = await me(legacy).expect(200);
    expect(authenticated.body.user).toMatchObject({ id, role: 'ADMIN' });
    expect(await version()).toBe(0);
    await logout(legacy).expect(204);
    expect(await version()).toBe(1);
    const revoked = await me(legacy).expect(401);
    expect(revoked.body).toMatchObject({ code: 'SESSION_REVOKED' });
    expect(revoked.body).not.toHaveProperty('user');
  });

  it.each(['GESTOR', 'PESQUISADOR', 'RESIDENTE'])('uses the current %s role for administrative RBAC', async (role) => {
    const token = sign();
    const organizationId = randomUUID();
    await setup.query("INSERT INTO organizations(id,name,status) VALUES($1,'Isolated organization','ACTIVE')", [organizationId]);
    await setup.query('INSERT INTO users_organizations(user_id,organization_id) VALUES($1,$2)', [id, organizationId]);
    await setup.query('UPDATE users SET role=$1 WHERE id=$2', [role, id]);
    await me(token).expect(200);
    await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it.each(['INACTIVE', 'DELETED'])('preserves account restrictions for %s', async (state) => {
    const token = sign();
    await setup.query("UPDATE users SET status='INACTIVE',deleted_at=CASE WHEN $1 THEN NOW() ELSE NULL END WHERE id=$2", [state === 'DELETED', id]);
    await me(token).expect(401);
    await login().expect(state === 'DELETED' ? 401 : 403);
    expect((await setup.query('SELECT deleted_at FROM users WHERE id=$1', [id])).rows[0].deleted_at === null).toBe(state !== 'DELETED');
  });

  it.each(['/api/auth/me', '/api/admin/users', '/api/dashboard/financial', '/api/dashboard/export'])('rejects anonymous access to %s and prevents caching', async (path) => {
    const response = await request(app).get(path).set('Cookie', 'token=untrusted');
    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
