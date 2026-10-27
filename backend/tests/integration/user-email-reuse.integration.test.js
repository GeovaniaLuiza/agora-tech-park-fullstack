import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({ sendPasswordReset: vi.fn(), sendInactive: vi.fn() }));
vi.mock('../../src/services/emailService.js', () => mail);
import app from '../../src/app.js';
import { pool, shutdown } from '../../src/db/pool.js';
import * as access from '../../src/repositories/accessRepository.js';
import * as users from '../../src/repositories/userRepository.js';
import * as resets from '../../src/repositories/passwordResetRepository.js';
import * as verification from '../../src/repositories/emailVerificationRepository.js';
import { record } from '../../src/repositories/auditRepository.js';

const sql = (text, values) => pool.query(text, values);
let adminId;
let organizationId;
let email;
let ids;
let formId;
const authorization = (id) => ({ Authorization: `Bearer ${jwt.sign({ sub: id }, process.env.JWT_SECRET)}` });
const roles = ['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE'];
const create = (role = 'RESIDENTE', value = email.toUpperCase()) => request(app).post('/api/admin/users').set(authorization(adminId))
  .send({ name: 'New User', email: value, role, organizationId: role === 'RESIDENTE' ? organizationId : null });

beforeEach(async () => {
  mail.sendPasswordReset.mockReset().mockResolvedValue({ accepted: true });
  mail.sendInactive.mockReset().mockResolvedValue({ accepted: true });
  adminId = randomUUID(); organizationId = randomUUID(); ids = [adminId]; formId = null;
  email = `${randomUUID()}@reuse.invalid`;
  await sql(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at)
    VALUES($1,'Admin',$2,'unused','ADMIN','ACTIVE',NOW())`, [adminId, `${adminId}@reuse.invalid`]);
  await sql("INSERT INTO organizations(id,name,status) VALUES($1,'Test Organization','ACTIVE')", [organizationId]);
});
afterEach(async () => {
  if (formId) await sql('DELETE FROM forms WHERE id=$1', [formId]);
  const created = await sql('SELECT id FROM users WHERE LOWER(email)=$1', [email]);
  const userIds = [...new Set([...ids, ...created.rows.map(({ id }) => id)])];
  await sql('DELETE FROM audit_logs WHERE user_id=ANY($1::uuid[]) OR entity_id=ANY($1::uuid[])', [userIds]);
  await sql('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
  await sql('DELETE FROM organizations WHERE id=$1', [organizationId]);
});
afterAll(shutdown);

describe('email uniqueness for non-deleted accounts', () => {
  // Even duplicate-email requests compute a real cost-12 hash before the uniqueness check.
  it.each(roles.flatMap((role) => ['ACTIVE', 'INACTIVE', 'PENDING', 'EMAIL_PENDING', 'REJECTED'].map((status) => [role, status])))('reserves email for %s / %s accounts, ignoring case', async (role, status) => {
    await sql(`INSERT INTO users(name,email,password_hash,role,status,email_verified_at)
      VALUES('Existing',$1,'unused',$2,$3,NOW())`, [email, role, status]);
    const response = await create(role);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EMAIL_ALREADY_EXISTS');
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  }, 10_000);

  // This full lifecycle performs several real cost-12 hashes and a real password comparison.
  it.each(roles)('%s reuses the email with a new identity, preserving history and isolating credentials', async (role) => {
    const first = await create(role, email.replace('@reuse.invalid', '@Reuse.Invalid'));
    expect(first.status).toBe(201);
    const oldId = first.body.id;
    ids.push(oldId);
    const oldReset = mail.sendPasswordReset.mock.calls[0][0].rawToken;
    const oldVerification = await verification.issue(oldId);
    await verification.markDelivered(oldVerification.tokenId);
    formId = (await sql("INSERT INTO forms(title,created_by) VALUES('Historical form',$1) RETURNING id", [oldId])).rows[0].id;
    await sql("INSERT INTO notifications(user_id,title,message) VALUES($1,'History','Keep me')", [oldId]);
    // Exercise the same status endpoint as the administration screen.
    await request(app).patch(`/api/admin/users/${oldId}/status`).set(authorization(adminId)).send({ status: 'INACTIVE' }).expect(200);
    expect((await sql('SELECT deleted_at FROM users WHERE id=$1', [oldId])).rows[0].deleted_at).toBeNull();
    expect((await create(role)).status).toBe(409);
    await request(app).delete(`/api/admin/users/${oldId}`).set(authorization(adminId)).expect(204);
    const old = (await sql('SELECT email,status,deleted_at FROM users WHERE id=$1', [oldId])).rows[0];
    expect(old).toMatchObject({ email, status: 'INACTIVE', deleted_at: expect.any(Date) });
    expect((await sql('SELECT created_by FROM forms WHERE id=$1', [formId])).rows[0].created_by).toBe(oldId);
    expect((await sql('SELECT user_id FROM notifications WHERE user_id=$1', [oldId])).rowCount).toBe(1);
    const oldLinks = (await sql('SELECT active FROM users_organizations WHERE user_id=$1', [oldId])).rows;
    expect(oldLinks).toEqual(role === 'RESIDENTE' ? [{ active: false }] : []);
    expect((await sql("SELECT action FROM audit_logs WHERE entity_id=$1 AND action='USER_DELETED'", [oldId])).rowCount).toBe(1);
    await access.linkOrganization(oldId, organizationId);
    expect((await sql('SELECT active FROM users_organizations WHERE user_id=$1', [oldId])).rows).toEqual(oldLinks);
    expect(await users.findByEmail(email)).toBeUndefined();
    expect(await users.findPublicProfile(oldId)).toBeNull();
    expect((await access.listUsers()).some(({ id }) => id === oldId)).toBe(false);
    await request(app).get('/api/auth/me').set(authorization(oldId)).expect(401);
    await request(app).patch(`/api/admin/users/${oldId}/status`).set(authorization(adminId)).send({ status: 'ACTIVE' }).expect(404);
    expect((await resets.consume(oldReset, 'must-not-change', async () => {})).state).toBe('INVALID');
    expect((await verification.verify(oldVerification.rawToken, async () => {})).state).toBe('INVALID');

    const second = await create(role);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(oldId);
    expect((await sql('SELECT status,deleted_at,role FROM users WHERE id=$1', [second.body.id])).rows[0]).toEqual({ status: 'ACTIVE', deleted_at: null, role });
    expect((await sql('SELECT deleted_at FROM users WHERE id=$1', [oldId])).rows[0].deleted_at).toBeInstanceOf(Date);
    const runtimeSql = await readFile(new URL('../../../database/runtime/ensure_auth_schema.sql', import.meta.url), 'utf8');
    await sql(runtimeSql.slice(runtimeSql.indexOf('\n') + 1));
    expect((await users.findByEmail(email.toUpperCase())).id).toBe(second.body.id);
    const invitation = mail.sendPasswordReset.mock.calls.at(-1)[0];
    const password = 'Safe-New-Password-123!';
    await request(app).post('/api/auth/reset-password').send({ token: invitation.rawToken, password, confirmPassword: password }).expect(200);
    const login = await request(app).post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(second.body.id);
    expect((await create(role)).status).toBe(409);
  }, 45_000);

  // This rollback scenario also performs two real cost-12 managed-user hashes.
  it('rolls deletion, links and token revocation back if auditing fails', async () => {
    const created = await create();
    expect(created.status).toBe(201);
    const id = created.body.id;
    await expect(access.setStatus(id, 'INACTIVE', adminId, async () => { throw new Error('audit failed'); }, { deleted: true })).rejects.toThrow('audit failed');
    expect((await users.findById(id)).status).toBe('ACTIVE');
    expect((await sql('SELECT active FROM users_organizations WHERE user_id=$1', [id])).rows[0].active).toBe(true);
    expect((await sql('SELECT used_at FROM password_reset_tokens WHERE user_id=$1', [id])).rows[0].used_at).toBeNull();
    expect((await create()).status).toBe(409);
  }, 10_000);

  it('keeps database uniqueness under concurrent inserts with different email casing', async () => {
    const insert = (value) => access.createManagedUser({ name: 'Concurrent', email: value, passwordHash: 'unused', role: 'GESTOR', adminId },
      (client, user) => record({ userId: adminId, action: 'USER_CREATED', entityId: user.id }, client));
    const results = await Promise.allSettled([insert(email), insert(email.toUpperCase())]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.find(({ status }) => status === 'rejected').reason.code).toBe('23505');
  });

  it('backfills only proven historical exclusions and replaces both absolute uniqueness protections', async () => {
    const client = await pool.connect();
    const schema = `email_migration_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET LOCAL search_path TO ${schema},public`);
      await client.query(`CREATE TABLE users(id uuid PRIMARY KEY,email text CONSTRAINT users_email_key UNIQUE,status text);
        CREATE UNIQUE INDEX idx_users_email_lower_unique ON users(LOWER(email));
        CREATE TABLE audit_logs(entity text,entity_id uuid,action text,created_at timestamptz);
        CREATE TABLE users_organizations(user_id uuid,active boolean,unlinked_at timestamptz);
        CREATE TABLE email_verification_tokens(user_id uuid,used_at timestamptz);
        CREATE TABLE password_reset_tokens(user_id uuid,used_at timestamptz);`);
      const cases = ['deleted', 'inactive', 'reactivated', 'laterInactive', 'ambiguous'];
      const caseIds = Object.fromEntries(cases.map((key) => [key, randomUUID()]));
      for (const key of cases) {
        await client.query("INSERT INTO users VALUES($1,$2,'INACTIVE')", [caseIds[key], `${key}@migration.invalid`]);
        if (key !== 'inactive') await client.query("INSERT INTO audit_logs VALUES('user',$1,'USER_DELETED','2026-01-01')", [caseIds[key]]);
      }
      await client.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [caseIds.reactivated]);
      await client.query("INSERT INTO audit_logs VALUES('user',$1,'USER_INACTIVATED','2026-01-02'),('user',$2,'USER_ACTIVATED','2026-01-01')", [caseIds.laterInactive, caseIds.ambiguous]);
      await client.query("INSERT INTO users_organizations VALUES($1,TRUE,NULL);", [caseIds.deleted]);
      await client.query('INSERT INTO password_reset_tokens VALUES($1,NULL)', [caseIds.deleted]);
      await client.query(await readFile(new URL('../../../database/migrations/020_user_email_soft_delete.sql', import.meta.url), 'utf8'));
      const rows = (await client.query('SELECT id,deleted_at FROM users')).rows;
      expect(rows.filter(({ deleted_at }) => deleted_at !== null).map(({ id }) => id)).toEqual([caseIds.deleted]);
      expect((await client.query('SELECT active FROM users_organizations')).rows[0].active).toBe(false);
      expect((await client.query('SELECT used_at FROM password_reset_tokens')).rows[0].used_at).toBeInstanceOf(Date);
      await client.query("INSERT INTO users(id,email,status) VALUES($1,'DELETED@MIGRATION.INVALID','ACTIVE')", [randomUUID()]);
      expect((await client.query('SELECT count(*)::int AS total FROM audit_logs')).rows[0].total).toBe(6);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
