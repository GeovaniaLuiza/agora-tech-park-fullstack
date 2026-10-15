import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({ sendFormInvitation: vi.fn() }));
vi.mock('../../src/services/emailService.js', () => mail);
import app from '../../src/app.js';
import { pool, shutdown } from '../../src/db/pool.js';

const sql = (text, values) => pool.query(text, values);
let ids;
let formIds;
const token = (id) => `Bearer ${jwt.sign({ sub: id }, process.env.JWT_SECRET)}`;
const audience = () => ({ organizationIds: [ids.org], recipientIds: [ids.resident] });
const publish = (formId, body = audience(), actor = ids.admin) => request(app)
  .post(`/api/forms/${formId}/publish`).set('Authorization', token(actor)).send(body);
const create = async (actor = ids.admin, dates = true) => {
  const response = await request(app).post('/api/forms').set('Authorization', token(actor))
    .send({ title: 'Coleta de teste', ...(dates ? { startDate: '2026-01-01', endDate: '2026-12-31' } : {}) });
  if (response.body.id) formIds.push(response.body.id);
  return response;
};
const readyForm = async () => {
  const response = await create();
  expect(response.status).toBe(201);
  await request(app).post(`/api/forms/${response.body.id}/questions`).set('Authorization', token(ids.admin))
    .send({ label: 'Pergunta de teste', type: 'TEXT' }).expect(201);
  return response.body.id;
};

beforeEach(async () => {
  vi.stubEnv('JWT_SECRET', 'forms-invitations-integration-secret-only');
  vi.clearAllMocks();
  mail.sendFormInvitation.mockReset().mockResolvedValue({ accepted: true });
  ids = Object.fromEntries(['admin', 'researcher', 'manager', 'resident', 'second', 'org', 'otherOrg'].map((key) => [key, randomUUID()]));
  formIds = [];
  for (const [key, role] of [['admin', 'ADMIN'], ['researcher', 'PESQUISADOR'], ['manager', 'GESTOR'], ['resident', 'RESIDENTE'], ['second', 'RESIDENTE']]) {
    await sql(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at)
      VALUES($1,$2,$3,'unused',$4,'ACTIVE',NOW())`, [ids[key], key, `${ids[key]}@forms-test.invalid`, role]);
  }
  await sql(`INSERT INTO organizations(id,name,status) VALUES ($1,'Empresa de teste','ACTIVE'),($2,'Outra empresa','ACTIVE')`, [ids.org, ids.otherOrg]);
  await sql(`INSERT INTO users_organizations(user_id,organization_id) VALUES ($1,$3),($2,$3)`, [ids.resident, ids.second, ids.org]);
});

afterEach(async () => {
  await sql('DELETE FROM notifications WHERE user_id=ANY($1::uuid[])', [[ids.resident, ids.second]]);
  await sql('DELETE FROM audit_logs WHERE user_id=ANY($1::uuid[])', [[ids.admin, ids.researcher, ids.manager, ids.resident, ids.second]]);
  await sql('DELETE FROM forms WHERE id=ANY($1::uuid[])', [formIds]);
  await sql('DELETE FROM users_organizations WHERE organization_id=ANY($1::uuid[])', [[ids.org, ids.otherOrg]]);
  await sql('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[ids.org, ids.otherOrg]]);
  await sql('DELETE FROM users WHERE id=ANY($1::uuid[])', [[ids.admin, ids.researcher, ids.manager, ids.resident, ids.second]]);
  vi.unstubAllEnvs();
});
afterAll(shutdown);

describe('form saving and invitations through HTTP and PostgreSQL', () => {
  it('creates and edits a draft without recipients or dates, persisting organizations without distribution', async () => {
    const created = await create(ids.admin, false);
    expect(created.status).toBe(201);
    const id = created.body.id;
    await request(app).put(`/api/forms/${id}`).set('Authorization', token(ids.admin))
      .send({ title: 'Coleta alterada', description: 'Descrição salva', startDate: '', endDate: '' }).expect(200);
    await request(app).put(`/api/forms/${id}/audience`).set('Authorization', token(ids.admin))
      .send({ organizationIds: [ids.org], recipientIds: [] }).expect(200);
    const form = (await sql('SELECT title,status,published_at FROM forms WHERE id=$1', [id])).rows[0];
    expect(form).toEqual({ title: 'Coleta alterada', status: 'DRAFT', published_at: null });
    expect((await sql('SELECT * FROM form_organizations WHERE form_id=$1', [id])).rows).toHaveLength(1);
    expect((await sql('SELECT * FROM form_respondents WHERE form_id=$1', [id])).rows).toHaveLength(0);
    expect(mail.sendFormInvitation).not.toHaveBeenCalled();
    const actions = (await sql('SELECT action FROM audit_logs WHERE entity_id=$1', [id])).rows.map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(['FORM_CREATED', 'FORM_UPDATED']));
    expect(actions).not.toContain('FORM_PUBLISHED');
  });

  it('saving a selected audience never sends email or activates a collection', async () => {
    const id = await readyForm();
    await request(app).put(`/api/forms/${id}/audience`).set('Authorization', token(ids.admin)).send(audience()).expect(200);
    expect((await sql('SELECT status,sent_at FROM form_respondents WHERE form_id=$1', [id])).rows).toEqual([{ status: 'PENDING', sent_at: null }]);
    expect((await sql('SELECT status FROM forms WHERE id=$1', [id])).rows[0].status).toBe('DRAFT');
    expect(mail.sendFormInvitation).not.toHaveBeenCalled();
  });

  it('preserves omitted dates and allows clearing dates in a draft', async () => {
    const id = await readyForm();
    const update = (body) => request(app).put(`/api/forms/${id}`).set('Authorization', token(ids.admin)).send(body);
    await update({ title: 'Coleta atualizada' }).expect(200);
    expect((await sql('SELECT start_date,end_date FROM forms WHERE id=$1', [id])).rows[0])
      .toMatchObject({ start_date: expect.any(Date), end_date: expect.any(Date) });
    await update({ startDate: '', endDate: '' }).expect(200);
    expect((await sql('SELECT start_date,end_date FROM forms WHERE id=$1', [id])).rows[0])
      .toEqual({ start_date: null, end_date: null });
    expect(mail.sendFormInvitation).not.toHaveBeenCalled();
  });

  it.each(['admin', 'researcher'])('allows %s to create, update and send an eligible resident invitation', async (role) => {
    const created = await create(ids[role]);
    expect(created.status).toBe(201);
    const id = created.body.id;
    await request(app).put(`/api/forms/${id}`).set('Authorization', token(ids[role])).send({ title: 'Coleta autorizada' }).expect(200);
    await request(app).post(`/api/forms/${id}/questions`).set('Authorization', token(ids[role]))
      .send({ label: 'Uma pergunta', type: 'TEXT' }).expect(201);
    const sent = await publish(id, audience(), ids[role]);
    expect(sent.status).toBe(200);
    expect(sent.body.notificationSummary).toMatchObject({ requested: 1, sent: 1, failed: 0 });
    expect(mail.sendFormInvitation).toHaveBeenCalledWith(expect.objectContaining({ id: ids.resident, email: `${ids.resident}@forms-test.invalid`, formId: id }));
    expect((await sql('SELECT status,sent_at FROM form_respondents WHERE form_id=$1', [id])).rows[0]).toMatchObject({ status: 'SENT', sent_at: expect.any(Date) });
    expect((await sql('SELECT action FROM audit_logs WHERE entity_id=$1', [id])).rows.map((row) => row.action))
      .toEqual(expect.arrayContaining(['FORM_PUBLISHED', 'FORM_EMAIL_SENT']));
  });

  it('keeps GESTOR and RESIDENTE unauthorized to create, edit or send', async () => {
    const id = await readyForm();
    for (const actor of [ids.manager, ids.resident]) {
      expect((await create(actor)).status).toBe(403);
      await request(app).put(`/api/forms/${id}`).set('Authorization', token(actor)).send({ title: 'Não autorizado' }).expect(403);
      await request(app).put(`/api/forms/${id}/audience`).set('Authorization', token(actor)).send(audience()).expect(403);
      expect((await publish(id, audience(), actor)).status).toBe(403);
    }
    expect(mail.sendFormInvitation).not.toHaveBeenCalled();
  });

  it.each(['other organization', 'inactive membership', 'inactive organization', 'unverified email', 'inactive user', 'wrong role'])('blocks %s', async (reason) => {
    const id = await readyForm();
    const body = audience();
    if (reason === 'other organization') body.organizationIds = [ids.otherOrg];
    if (reason === 'inactive membership') await sql('UPDATE users_organizations SET active=FALSE WHERE user_id=$1', [ids.resident]);
    if (reason === 'inactive organization') await sql("UPDATE organizations SET status='INACTIVE' WHERE id=$1", [ids.org]);
    if (reason === 'unverified email') await sql('UPDATE users SET email_verified_at=NULL WHERE id=$1', [ids.resident]);
    if (reason === 'inactive user') await sql("UPDATE users SET status='INACTIVE' WHERE id=$1", [ids.resident]);
    if (reason === 'wrong role') await sql("UPDATE users SET role='GESTOR' WHERE id=$1", [ids.resident]);
    expect((await publish(id, body)).status).toBe(422);
    expect(mail.sendFormInvitation).not.toHaveBeenCalled();
    expect((await sql('SELECT status FROM forms WHERE id=$1', [id])).rows[0].status).toBe('DRAFT');
  });

  it('requires recipients only for publication', async () => {
    const id = await readyForm();
    const response = await publish(id, { organizationIds: [ids.org], recipientIds: [] });
    expect(response.status).toBe(422);
    expect(response.body.message).toBe('Selecione ao menos um respondente para enviar o formulário.');
    expect(mail.sendFormInvitation).not.toHaveBeenCalled();
  });

  it('serializes concurrent publications and prevents implicit resending', async () => {
    const id = await readyForm();
    const results = await Promise.all([publish(id), publish(id)]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(mail.sendFormInvitation).toHaveBeenCalledOnce();
    expect((await publish(id)).status).toBe(409);
    expect(mail.sendFormInvitation).toHaveBeenCalledOnce();
    expect((await sql('SELECT * FROM form_respondents WHERE form_id=$1', [id])).rows).toHaveLength(1);
  });

  it('keeps the form and audits partial email failure without external email delivery', async () => {
    const id = await readyForm();
    mail.sendFormInvitation.mockImplementation(({ id: userId }) => userId === ids.second ? Promise.reject(new Error('Delivery unavailable')) : Promise.resolve());
    const response = await publish(id, { organizationIds: [ids.org], recipientIds: [ids.resident, ids.second] });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ACTIVE');
    expect(response.body.notificationSummary).toMatchObject({ requested: 2, sent: 1, failed: 1 });
    const deliveries = (await sql('SELECT user_id,status,last_error FROM form_respondents WHERE form_id=$1', [id])).rows;
    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ user_id: ids.resident, status: 'SENT', last_error: null }),
      expect.objectContaining({ user_id: ids.second, status: 'FAILED', last_error: 'Delivery unavailable' }),
    ]));
    const audit = (await sql("SELECT details FROM audit_logs WHERE entity_id=$1 AND action='FORM_EMAIL_FAILED'", [id])).rows;
    expect(audit).toEqual([{ details: { respondentId: ids.second } }]);
    expect((await publish(id)).status).toBe(409);
    expect(mail.sendFormInvitation).toHaveBeenCalledTimes(2);
  });

  it('retries a failed invitation only through explicit resend and rechecks eligibility', async () => {
    const id = await readyForm();
    mail.sendFormInvitation.mockRejectedValueOnce(new Error('Delivery unavailable'));
    expect((await publish(id)).body.notificationSummary.failed).toBe(1);
    const resend = () => request(app).post(`/api/forms/${id}/respondents/${ids.resident}/resend`)
      .set('Authorization', token(ids.admin)).send({});
    const response = await resend();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ respondentId: ids.resident, sent: 1, failed: 0 });
    expect((await sql('SELECT status,sent_at,last_error FROM form_respondents WHERE form_id=$1 AND user_id=$2', [id, ids.resident])).rows[0])
      .toMatchObject({ status: 'SENT', sent_at: expect.any(Date), last_error: null });
    await sql('UPDATE users_organizations SET active=FALSE WHERE user_id=$1', [ids.resident]);
    expect((await resend()).status).toBe(422);
    expect(mail.sendFormInvitation).toHaveBeenCalledTimes(2);
  });
});
