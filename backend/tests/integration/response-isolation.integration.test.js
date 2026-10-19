import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { pool, shutdown } from '../../src/db/pool.js';
import { institutionalCards } from '../../src/repositories/dashboardRepository.js';

const year = 2195;
const sql = (text, values) => pool.query(text, values);
let ids;
const authorization = (user) => ({ Authorization: `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}` });
const endpoint = () => `/api/forms/${ids.form}/organizations/${ids.org}/responses`;
const read = (user, query = '') => request(app).get(endpoint() + query).set(authorization(user));
const write = (user, value, submit = false, extra = {}) => request(app)[submit ? 'post' : 'put'](
  `/api/forms/${ids.form}/responses${submit ? '' : '/draft'}`,
).set(authorization(user)).send({ organizationId: ids.org, answers: [{ questionId: ids.question, value }], ...extra });

beforeEach(async () => {
  ids = Object.fromEntries(['admin', 'a', 'b', 'outsider', 'org', 'otherOrg', 'center', 'indicator', 'form', 'question'].map((key) => [key, randomUUID()]));
  for (const [key, role] of [['admin', 'ADMIN'], ['a', 'RESIDENTE'], ['b', 'RESIDENTE'], ['outsider', 'RESIDENTE']]) {
    await sql(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at)
      VALUES($1,'Identity test',$2,'unused',$3,'ACTIVE',NOW())`, [ids[key], `${ids[key]}@response-isolation.invalid`, role]);
  }
  await sql("INSERT INTO organizations(id,name) VALUES($1,'Organization X'),($2,'Organization Z')", [ids.org, ids.otherOrg]);
  for (const user of [ids.a, ids.b, ids.outsider]) await sql('INSERT INTO users_organizations(user_id,organization_id) VALUES($1,$2)', [user, ids.org]);
  await sql("INSERT INTO innovation_centers(id,code,name) VALUES($1,$2,'Isolation center')", [ids.center, ids.center]);
  await sql(`INSERT INTO indicator_definitions(id,code,name,category,unit,value_type,periodicity,aggregation_type,annual_aggregation,calculation_type)
    VALUES($1,$2,'Individual contribution','Isolation','UNIDADE','INTEGER','MONTHLY','SUM','SUM','MANUAL')`, [ids.indicator, ids.indicator]);
  await sql(`INSERT INTO forms(id,title,status,created_by,start_date,end_date,innovation_center_id,indicator_year,indicator_month)
    VALUES($1,'Individual responses','ACTIVE',$2,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day',$3,$4,5)`, [ids.form, ids.admin, ids.center, year]);
  await sql("INSERT INTO questions(id,form_id,label,type,required) VALUES($1,$2,'Collected number','NUMBER',TRUE)", [ids.question, ids.form]);
  await sql("INSERT INTO question_indicator_links(question_id,indicator_id,aggregation_type,periodicity) VALUES($1,$2,'SUM','MONTHLY')", [ids.question, ids.indicator]);
  await sql('INSERT INTO form_organizations(form_id,organization_id) VALUES($1,$2)', [ids.form, ids.org]);
  await sql('INSERT INTO form_respondents(form_id,user_id,organization_id) VALUES($1,$2,$4),($1,$3,$4)', [ids.form, ids.a, ids.b, ids.org]);
});

afterEach(async () => {
  await sql('DELETE FROM indicator_records WHERE innovation_center_id=$1', [ids.center]);
  await sql('DELETE FROM indicator_values WHERE innovation_center_id=$1', [ids.center]);
  await sql('DELETE FROM responses WHERE form_id=$1', [ids.form]);
  await sql('DELETE FROM forms WHERE id=$1', [ids.form]);
  await sql('DELETE FROM indicator_definitions WHERE id=$1', [ids.indicator]);
  await sql('DELETE FROM innovation_centers WHERE id=$1', [ids.center]);
  await sql('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[ids.org, ids.otherOrg]]);
  await sql('DELETE FROM audit_logs WHERE user_id=ANY($1::uuid[])', [[ids.admin, ids.a, ids.b, ids.outsider]]);
  await sql('DELETE FROM users WHERE id=ANY($1::uuid[])', [[ids.admin, ids.a, ids.b, ids.outsider]]);
});
afterAll(shutdown);

describe('individual response ownership through real HTTP and PostgreSQL', () => {
  it('keeps distinct drafts, final IDs, answers, owners and last writers for residents of the same organization', async () => {
    const a = await write(ids.a, '10').expect(200);
    const b = await write(ids.b, '30').expect(200);
    expect(a.body.id).not.toBe(b.body.id);
    for (const [user, result, value] of [[ids.a, a, '10'], [ids.b, b, '30']]) {
      const own = await read(user).expect(200);
      expect(own.body).toMatchObject({ id: result.body.id, respondent_user_id: user, organization_id: ids.org, answered_by: user, status: 'DRAFT' });
      expect(own.body.answers).toEqual([expect.objectContaining({ question_id: ids.question, value })]);
      const history = await request(app).get(`/api/organizations/${ids.org}/responses`).set(authorization(user)).expect(200);
      expect(history.body).toHaveLength(1);
      expect(history.body[0].id).toBe(result.body.id);
    }
    expect((await write(ids.a, '10', true).expect(201)).body.id).toBe(a.body.id);
    expect((await read(ids.b).expect(200)).body.status).toBe('DRAFT');
    expect((await write(ids.b, '30', true).expect(201)).body.id).toBe(b.body.id);
    const rows = (await sql('SELECT id,organization_id,respondent_user_id,answered_by,status FROM responses WHERE form_id=$1', [ids.form])).rows;
    expect(rows).toEqual(expect.arrayContaining([
      { id: a.body.id, organization_id: ids.org, respondent_user_id: ids.a, answered_by: ids.a, status: 'SUBMITTED' },
      { id: b.body.id, organization_id: ids.org, respondent_user_id: ids.b, answered_by: ids.b, status: 'SUBMITTED' },
    ]));
    expect((await sql('SELECT response_id,value FROM answers WHERE response_id=ANY($1::uuid[])', [[a.body.id, b.body.id]])).rows)
      .toEqual(expect.arrayContaining([{ response_id: a.body.id, value: '10' }, { response_id: b.body.id, value: '30' }]));
    expect((await write(ids.a, '99', true).expect(409)).body.code).toBe('RESPONSE_ALREADY_SUBMITTED');
  });

  it('rejects another response ID and ignores forged ownership in the payload and userId query', async () => {
    const a = await write(ids.a, '10').expect(200);
    await read(ids.b, `?responseId=${a.body.id}`).expect(404);
    const b = await write(ids.b, '30', false, { responseId: a.body.id, userId: ids.a, respondent_user_id: ids.a, answered_by: ids.a }).expect(200);
    expect(b.body.id).not.toBe(a.body.id);
    const own = await read(ids.b, `?userId=${ids.a}&respondent_user_id=${ids.a}`).expect(200);
    expect(own.body.respondent_user_id).toBe(ids.b);
    await read(ids.b, `?responseId=${a.body.id}`).expect(404);
    expect((await read(ids.a).expect(200)).body.answers[0].value).toBe('10');
    await read(ids.outsider, `?responseId=${a.body.id}`).expect(404);
    await write(ids.outsider, '99').expect(403);
    await request(app).patch(`/api/responses/${a.body.id}/reopen`).set(authorization(ids.b)).expect(403);
    await request(app).get(endpoint()).expect(401);
    await write(ids.admin, '99').expect(403);
  });

  it('retains staff access and requires an explicit response ID when an organization has multiple responses', async () => {
    const a = await write(ids.a, '10').expect(200);
    await write(ids.b, '30').expect(200);
    expect((await read(ids.admin).expect(409)).body.code).toBe('RESPONSE_SELECTION_REQUIRED');
    expect((await read(ids.admin, `?responseId=${a.body.id}`).expect(200)).body.id).toBe(a.body.id);
    expect((await request(app).get(`/api/organizations/${ids.org}/responses`).set(authorization(ids.admin)).expect(200)).body).toHaveLength(2);
  });

  it('preserves the existing single-respondent flow', async () => {
    await sql('DELETE FROM form_respondents WHERE form_id=$1 AND user_id=$2', [ids.form, ids.b]);
    const draft = await write(ids.a, '7').expect(200);
    const sent = await write(ids.a, '8', true).expect(201);
    expect(sent.body.id).toBe(draft.body.id);
    expect((await read(ids.a).expect(200)).body).toMatchObject({ answered_by: ids.a, respondent_user_id: ids.a, status: 'SUBMITTED' });
  });

  it('preserves distinct organizations for one resident on legacy collections without individual assignments', async () => {
    await sql('DELETE FROM form_respondents WHERE form_id=$1', [ids.form]);
    await sql('INSERT INTO users_organizations(user_id,organization_id) VALUES($1,$2)', [ids.a, ids.otherOrg]);
    await sql('INSERT INTO form_organizations(form_id,organization_id) VALUES($1,$2)', [ids.form, ids.otherOrg]);
    const x = await write(ids.a, '10').expect(200);
    const z = await write(ids.a, '20', false, { organizationId: ids.otherOrg }).expect(200);
    expect(x.body.id).not.toBe(z.body.id);
    const other = await request(app).get(`/api/forms/${ids.form}/organizations/${ids.otherOrg}/responses`).set(authorization(ids.a)).expect(200);
    expect(other.body).toMatchObject({ id: z.body.id, respondent_user_id: ids.a, organization_id: ids.otherOrg });
    expect((await read(ids.a).expect(200)).body.id).toBe(x.body.id);
  });

  it('serializes retries from one owner without merging concurrent drafts from different owners', async () => {
    const [a, b] = await Promise.all([write(ids.a, '10'), write(ids.b, '30')]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.id).not.toBe(b.body.id);
    const retries = await Promise.all([write(ids.a, '11'), write(ids.a, '12')]);
    expect(retries.map(({ body }) => body.id)).toEqual([a.body.id, a.body.id]);
    expect((await sql('SELECT id FROM responses WHERE form_id=$1', [ids.form])).rowCount).toBe(2);
    expect((await read(ids.b).expect(200)).body.answers[0].value).toBe('30');
  });

  it('does not expose, claim, overwrite or duplicate unresolved historical responses', async () => {
    const legacy = (await sql(`INSERT INTO responses(form_id,organization_id,answered_by,status)
      VALUES($1,$2,$3,'SUBMITTED') RETURNING id`, [ids.form, ids.org, ids.a])).rows[0].id;
    await sql('INSERT INTO answers(response_id,question_id,value) VALUES($1,$2,99)', [legacy, ids.question]);
    await read(ids.a).expect(404);
    await read(ids.b).expect(404);
    for (const user of [ids.a, ids.b]) {
      expect((await write(user, '10', true).expect(409)).body.code).toBe('LEGACY_RESPONSE_REVIEW_REQUIRED');
    }
    expect((await sql('SELECT id,respondent_user_id FROM responses WHERE form_id=$1', [ids.form])).rows).toEqual([{ id: legacy, respondent_user_id: null }]);
    expect((await sql('SELECT value FROM answers WHERE response_id=$1', [legacy])).rows).toEqual([{ value: '99' }]);
    expect((await read(ids.admin, `?responseId=${legacy}`).expect(200)).body.id).toBe(legacy);
  });

  it.each([
    ['SUM', 40, 50], ['COUNT', 2, 2], ['AVERAGE', 20, 25], ['LAST_VALUE', 30, 20],
  ])('keeps %s aggregation isolated and idempotent across submission, reopening and resubmission', async (strategy, firstValue, finalValue) => {
    await sql('UPDATE indicator_definitions SET aggregation_type=$2,annual_aggregation=$2 WHERE id=$1', [ids.indicator, strategy]);
    const a = await write(ids.a, '10', true).expect(201);
    const b = await write(ids.b, '30', true).expect(201);
    expect(a.body.id).not.toBe(b.body.id);
    const consolidated = async () => (await sql(`SELECT numeric_value FROM indicator_values
      WHERE indicator_id=$1 AND innovation_center_id=$2 AND source_type='FORM_RESPONSE' AND deleted_at IS NULL ORDER BY month NULLS LAST`, [ids.indicator, ids.center])).rows.map(({ numeric_value }) => Number(numeric_value));
    expect(await consolidated()).toEqual([firstValue, firstValue]);
    const contribution = (await sql('SELECT response_id,organization_id,numeric_value FROM indicator_records WHERE indicator_id=$1 AND active', [ids.indicator])).rows;
    expect(contribution).toHaveLength(2);
    expect(contribution.map(({ response_id }) => response_id)).toEqual(expect.arrayContaining([a.body.id, b.body.id]));
    expect(contribution.every(({ organization_id }) => organization_id === ids.org)).toBe(true);
    await request(app).patch(`/api/responses/${a.body.id}/reopen`).set(authorization(ids.admin)).expect(200);
    expect(await consolidated()).toEqual([strategy === 'COUNT' ? 1 : 30, strategy === 'COUNT' ? 1 : 30]);
    expect((await read(ids.b).expect(200)).body.answers[0].value).toBe('30');
    await write(ids.a, '20', true).expect(201);
    expect(await consolidated()).toEqual([finalValue, finalValue]);
    expect((await sql('SELECT id FROM indicator_records WHERE indicator_id=$1', [ids.indicator])).rowCount).toBe(2);
    expect(Number((await institutionalCards({ year, month: 5, centerId: ids.center, sourceType: 'LIVE' })).find(({ code }) => code === ids.indicator).value)).toBe(finalValue);
  });
});
