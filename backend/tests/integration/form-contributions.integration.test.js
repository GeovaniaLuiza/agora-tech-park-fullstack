import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/app.js';
import { pool, shutdown } from '../../src/db/pool.js';
import { institutionalCards } from '../../src/repositories/dashboardRepository.js';
import { summary } from '../../src/repositories/indicatorRepository.js';
import { recompute } from '../../src/services/indicatorCalculationService.js';

const year = 2197;
const sql = (text, params) => pool.query(text, params);
let ids;
let auth;
const token = (user) => `Bearer ${jwt.sign({ sub: user }, process.env.JWT_SECRET)}`;
const post = (org = ids.orgA, value = '10', extra = {}) => request(app)
  .post(`/api/forms/${ids.form}/responses`).set('Authorization', auth)
  .send({ organizationId: org, answers: [{ questionId: ids.question, value }], ...extra });
const reopen = (id) => request(app).patch(`/api/responses/${id}/reopen`).set('Authorization', token(ids.admin));
const values = async (center = ids.centerA, indicator = ids.indicator) => (await sql(
  `SELECT * FROM indicator_values WHERE innovation_center_id=$1 AND indicator_id=$2 AND year=$3
   AND source_type='FORM_RESPONSE' AND deleted_at IS NULL ORDER BY month NULLS LAST`, [center, indicator, year])).rows;

beforeEach(async () => {
  vi.stubEnv('JWT_SECRET', 'phase10-integration-secret-only');
  ids = Object.fromEntries(['admin','resident','residentB','orgA','orgB','centerA','centerB','form','question','free','indicator','other']
    .map((key) => [key, randomUUID()]));
  await sql(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at) VALUES
    ($1::uuid,'Admin',($1::uuid)::text || '@phase10.invalid','unused','ADMIN','ACTIVE',NOW()),
    ($2::uuid,'Resident A',($2::uuid)::text || '@phase10.invalid','unused','RESIDENTE','ACTIVE',NOW()),
    ($3::uuid,'Resident B',($3::uuid)::text || '@phase10.invalid','unused','RESIDENTE','ACTIVE',NOW())`, [ids.admin, ids.resident, ids.residentB]);
  await sql(`INSERT INTO organizations(id,name,status) VALUES ($1,'Organization A','ACTIVE'),($2,'Organization B','ACTIVE')`, [ids.orgA, ids.orgB]);
  await sql(`INSERT INTO users_organizations(user_id,organization_id) VALUES ($1,$3),($2,$4)`, [ids.resident, ids.residentB, ids.orgA, ids.orgB]);
  await sql(`INSERT INTO innovation_centers(id,code,name) VALUES ($1::uuid,($1::uuid)::text,'Center A'),($2::uuid,($2::uuid)::text,'Center B')`, [ids.centerA, ids.centerB]);
  await sql(`INSERT INTO indicator_definitions(id,code,name,category,unit,value_type,periodicity,aggregation_type,annual_aggregation,calculation_type)
    VALUES ($1::uuid,($1::uuid)::text,'Collected metric','Integration','UNIDADE','INTEGER','MONTHLY','SUM','SUM','MANUAL'),
    ($2::uuid,($2::uuid)::text,'Other metric','Integration','UNIDADE','INTEGER','MONTHLY','SUM','SUM','MANUAL')`, [ids.indicator, ids.other]);
  await sql(`INSERT INTO forms(id,title,status,created_by,start_date,end_date,innovation_center_id,indicator_year,indicator_month)
    VALUES ($1,'Collection','ACTIVE',$2,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day',$3,$4,5)`, [ids.form, ids.admin, ids.centerA, year]);
  await sql(`INSERT INTO questions(id,form_id,label,type,required,position) VALUES ($1,$3,'Mapped','NUMBER',FALSE,0),($2,$3,'Free','TEXT',FALSE,1)`, [ids.question, ids.free, ids.form]);
  await sql(`INSERT INTO question_indicator_links(question_id,indicator_id,aggregation_type,periodicity) VALUES ($1,$2,'SUM','MONTHLY')`, [ids.question, ids.indicator]);
  await sql(`INSERT INTO form_organizations(form_id,organization_id) VALUES ($1,$2),($1,$3)`, [ids.form, ids.orgA, ids.orgB]);
  await sql(`INSERT INTO form_respondents(form_id,user_id,organization_id) VALUES ($1,$2,$4),($1,$3,$5)`, [ids.form, ids.resident, ids.residentB, ids.orgA, ids.orgB]);
  auth = token(ids.resident);
});
afterEach(async () => {
  await sql('DELETE FROM indicator_records WHERE response_id IN (SELECT id FROM responses WHERE form_id=$1)', [ids.form]);
  await sql('DELETE FROM indicator_values WHERE innovation_center_id=ANY($1::uuid[])', [[ids.centerA, ids.centerB]]);
  await sql('DELETE FROM responses WHERE form_id=$1', [ids.form]);
  await sql('DELETE FROM forms WHERE id=$1', [ids.form]);
  await sql('DELETE FROM indicator_definitions WHERE id=ANY($1::uuid[])', [[ids.indicator, ids.other]]);
  await sql('DELETE FROM innovation_centers WHERE id=ANY($1::uuid[])', [[ids.centerA, ids.centerB]]);
  await sql('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[ids.orgA, ids.orgB]]);
  await sql('DELETE FROM users WHERE id=ANY($1::uuid[])', [[ids.admin, ids.resident, ids.residentB]]);
  vi.unstubAllEnvs();
});
afterAll(shutdown);

describe('form contributions through authenticated HTTP and PostgreSQL', () => {
  it('publishes with explicit mapping, organization, center, competence and source through the dashboard', async () => {
    const result = await post();
    expect(result.status).toBe(201);
    const records = (await sql('SELECT * FROM indicator_records WHERE response_id=$1', [result.body.id])).rows;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ question_id: ids.question, indicator_id: ids.indicator, organization_id: ids.orgA,
      innovation_center_id: ids.centerA, year, month: 5, source_type: 'FORM_RESPONSE' });
    const published = await values();
    expect(published.map((v) => Number(v.numeric_value))).toEqual([10, 10]);
    expect(published.every((v) => v.organization_id === null && v.source_id === null)).toBe(true);
    expect(Number((await summary({ period: `${year}-05`, centerId: ids.centerA })).find((v) => v.id === ids.indicator).value)).toBe(10);
    const card = (await institutionalCards({ year, month: 5, centerId: ids.centerA })).find((v) => v.id === ids.indicator);
    expect(Number(card.numeric_value)).toBe(10);
    expect(card.source_type).toBe('FORM_RESPONSE');
  });
  it('does not publish unmapped questions or client-supplied mappings', async () => {
    expect((await post(ids.orgA, '10', { answers: [{ questionId: ids.free, value: '99', indicator_id: ids.indicator, indicatorId: ids.indicator }] })).status).toBe(201);
    expect(await values()).toHaveLength(0);
  });
  it('rejects invalid values atomically', async () => {
    expect((await post(ids.orgA, 'invalid')).status).toBe(422);
    expect((await post(ids.orgA, '-1')).status).toBe(422);
    expect((await sql('SELECT id FROM responses WHERE form_id=$1', [ids.form])).rows).toHaveLength(0);
    expect(await values()).toHaveLength(0);
  });
  it('ignores forged indicator, center, source and consolidated value', async () => {
    expect((await post(ids.orgA, '7', { indicatorId: ids.other, centerId: ids.centerB,
      innovation_center_id: ids.centerB, source_type: 'MANUAL_ENTRY', numeric_value: 999 })).status).toBe(201);
    expect(Number((await values())[0].numeric_value)).toBe(7);
    expect(await values(ids.centerB)).toHaveLength(0);
    expect(await values(ids.centerA, ids.other)).toHaveLength(0);
  });
  it('rejects arbitrary organizations, including another active membership without assignment', async () => {
    expect((await post(ids.orgB)).status).toBe(403);
    await sql('INSERT INTO users_organizations(user_id,organization_id) VALUES ($1,$2)', [ids.resident, ids.orgB]);
    expect((await post(ids.orgB)).status).toBe(403);
    expect(await values()).toHaveLength(0);
    expect((await post(ids.orgA)).status).toBe(201);
  });
  it('rejects inactive organizations, anonymous users and unauthorized roles', async () => {
    await sql("UPDATE organizations SET status='INACTIVE' WHERE id=$1", [ids.orgA]);
    expect((await post()).status).toBe(401);
    expect((await request(app).post(`/api/forms/${ids.form}/responses`).send({})).status).toBe(401);
    auth = token(ids.admin);
    expect((await post()).status).toBe(403);
    expect(await values()).toHaveLength(0);
  });
  it('withdraws reopened answers, then edits without adding twice', async () => {
    const result = await post();
    expect((await post()).status).toBe(409);
    expect((await reopen(result.body.id)).status).toBe(200);
    expect(await values()).toHaveLength(0);
    expect((await post(ids.orgA, '25')).status).toBe(201);
    expect(Number((await values())[0].numeric_value)).toBe(25);
    expect((await sql('SELECT id FROM indicator_records WHERE response_id=$1', [result.body.id])).rows).toHaveLength(1);
  });
  it('removes optional answers without retaining a contribution', async () => {
    const result = await post();
    await reopen(result.body.id);
    expect((await post(ids.orgA, '', { answers: [] })).status).toBe(201);
    expect(await values()).toHaveLength(0);
  });
  it('aggregates responses while keeping the other organization unchanged during edits', async () => {
    const first = await post(ids.orgA, '10');
    auth = token(ids.residentB);
    expect((await post(ids.orgB, '20')).status).toBe(201);
    expect(Number((await values())[0].numeric_value)).toBe(30);
    await reopen(first.body.id);
    expect(Number((await values())[0].numeric_value)).toBe(20);
    const remaining = (await sql('SELECT organization_id,numeric_value FROM indicator_records WHERE indicator_id=$1 AND active', [ids.indicator])).rows;
    expect(remaining).toEqual([{ organization_id: ids.orgB, numeric_value: '20.0000' }]);
  });
  it('serializes simultaneous first submissions', async () => {
    const results = await Promise.all([post(), post()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(Number((await values())[0].numeric_value)).toBe(10);
  });
  it('keeps centers and configured periods isolated', async () => {
    await post();
    await sql('UPDATE forms SET innovation_center_id=$2,indicator_month=6 WHERE id=$1', [ids.form, ids.centerB]);
    auth = token(ids.residentB);
    await post(ids.orgB, '20');
    expect(Number((await values())[0].numeric_value)).toBe(10);
    expect((await values(ids.centerB)).find((v) => v.month === 6).numeric_value).toBe('20.0000');
    expect((await institutionalCards({ year, month: 5, centerId: ids.centerB })).find((v) => v.id === ids.indicator)).toBeUndefined();
  });
  it.each([['AVERAGE', 15], ['COUNT', 2], ['LAST_VALUE', 20]])('honors explicit %s aggregation', async (strategy, expected) => {
    await sql('UPDATE indicator_definitions SET aggregation_type=$2,annual_aggregation=$2 WHERE id=$1', [ids.indicator, strategy]);
    await post(ids.orgA, '10');
    auth = token(ids.residentB);
    await post(ids.orgB, '20');
    expect((await values()).map((v) => Number(v.numeric_value))).toEqual([expected, expected]);
  });
  it('central recalculation preserves collected values', async () => {
    const submitted = await post();
    await recompute(ids.centerA, year, ids.admin);
    expect(Number((await summary({ period: String(year), centerId: ids.centerA })).find((v) => v.id === ids.indicator).value)).toBe(10);
    await reopen(submitted.body.id);
    expect((await summary({ period: String(year), centerId: ids.centerA })).find((v) => v.id === ids.indicator).value).toBeNull();
  });
  it('does not publish text questions automatically', async () => {
    await sql("UPDATE questions SET type='TEXT' WHERE id=$1", [ids.question]);
    expect((await post()).status).toBe(201);
    expect(await values()).toHaveLength(0);
  });
  it('does not infer numerical meaning from selection questions', async () => {
    await sql("UPDATE questions SET type='OPTION' WHERE id=$1", [ids.question]);
    await sql("INSERT INTO question_options(question_id,value) VALUES($1,'10')", [ids.question]);
    expect((await post()).status).toBe(201);
    expect(await values()).toHaveLength(0);
  });
  it('rejects an unsupported aggregation without publishing a response', async () => {
    await sql("UPDATE indicator_definitions SET aggregation_type='MANUAL' WHERE id=$1", [ids.indicator]);
    expect((await post()).body.code).toBe('UNSUPPORTED_FORM_AGGREGATION');
    expect((await sql('SELECT id FROM responses WHERE form_id=$1', [ids.form])).rows).toHaveLength(0);
  });
  it('serializes different organizations contributing concurrently', async () => {
    const first = post(ids.orgA, '10');
    auth = token(ids.residentB);
    const results = await Promise.all([first, post(ids.orgB, '20')]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(Number((await values())[0].numeric_value)).toBe(30);
  });
  it('accumulates separate monthly contributions into the annual total', async () => {
    await post(ids.orgA, '10');
    await sql('UPDATE forms SET indicator_month=6 WHERE id=$1', [ids.form]);
    auth = token(ids.residentB);
    await post(ids.orgB, '20');
    expect((await values()).map((v) => [v.month, Number(v.numeric_value)])).toEqual([[5, 10], [6, 20], [null, 30]]);
  });
  it.each([5, 6])('preserves legacy values when publishing month %s of the same year', async (month) => {
    await sql('UPDATE forms SET indicator_month=$2 WHERE id=$1', [ids.form, month]);
    await sql(`INSERT INTO indicator_values(indicator_id,innovation_center_id,year,month,period_start,period_end,numeric_value,source_type,source_id)
      VALUES($1,$2,$3,5,make_date($3::int,5,1),make_date($3::int,5,31),99,'FORM_RESPONSE',$4)`,
    [ids.indicator, ids.centerA, year, randomUUID()]);
    const result = await post();
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('LEGACY_FORM_VALUES_REQUIRE_REVIEW');
    expect(Number((await values())[0].numeric_value)).toBe(99);
    expect((await sql('SELECT id FROM responses WHERE form_id=$1', [ids.form])).rows).toHaveLength(0);
  });
  it('exposes collected values through the real indicator and institutional dashboard endpoints', async () => {
    const official = (await sql("SELECT id,code FROM indicator_definitions WHERE code='CAPACITACOES_REALIZADAS'")).rows[0];
    await sql('UPDATE question_indicator_links SET indicator_id=$2 WHERE question_id=$1', [ids.question, official.id]);
    await post();
    const result = await request(app).get(`/api/indicators?period=${year}-05&centerId=${ids.centerA}`).set('Authorization', auth);
    expect(result.status).toBe(200);
    expect(Number(result.body.find((v) => v.id === official.id).value)).toBe(10);
    const dashboard = await request(app).get(`/api/dashboard/institutional-summary?year=${year}&month=5&centerId=${ids.centerA}`).set('Authorization', auth);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.cards.find((v) => v.code === official.code)).toMatchObject({ value: 10, source: 'FORM_RESPONSE' });
  });
  it('blocks raw contribution reads and edits through generic record endpoints', async () => {
    const submitted = await post();
    const record = (await sql('SELECT id FROM indicator_records WHERE response_id=$1', [submitted.body.id])).rows[0];
    const base = '/api/indicator-management/records/FORM_RESPONSE';
    expect((await request(app).get(`${base}?centerId=${ids.centerA}`).set('Authorization', auth)).status).toBe(422);
    expect((await request(app).post(base).set('Authorization', auth).send({})).status).toBe(403);
    expect((await request(app).delete(`${base}/${record.id}`).set('Authorization', token(ids.admin))).status).toBe(422);
    expect(Number((await values())[0].numeric_value)).toBe(10);
  });
  it('withdraws and recalculates the existing financial derived indicator atomically', async () => {
    const definitions = (await sql("SELECT id,code FROM indicator_definitions WHERE code IN ('RECEITA_TOTAL_CENTRO','DESPESAS_TOTAL_CENTRO','RESULTADO_ANUAL_CENTRO')")).rows;
    const definitionId = (code) => definitions.find((v) => v.code === code).id;
    await sql('UPDATE question_indicator_links SET indicator_id=$2 WHERE question_id=$1', [ids.question, definitionId('RECEITA_TOTAL_CENTRO')]);
    await sql("UPDATE questions SET type='DECIMAL' WHERE id=$1", [ids.free]);
    await sql("INSERT INTO question_indicator_links(question_id,indicator_id,aggregation_type,periodicity) VALUES($1,$2,'SUM','MONTHLY')", [ids.free, definitionId('DESPESAS_TOTAL_CENTRO')]);
    const result = await post(ids.orgA, '100', { answers: [{ questionId: ids.question, value: '100' }, { questionId: ids.free, value: '35' }] });
    expect(result.status).toBe(201);
    const derived = () => sql("SELECT numeric_value FROM indicator_values WHERE innovation_center_id=$1 AND indicator_id=$2 AND year=$3 AND deleted_at IS NULL", [ids.centerA, definitionId('RESULTADO_ANUAL_CENTRO'), year]);
    expect((await derived()).rows.map((v) => Number(v.numeric_value))).toEqual([65, 65]);
    expect((await reopen(result.body.id)).status).toBe(200);
    expect((await derived()).rows).toHaveLength(0);
  });
});
