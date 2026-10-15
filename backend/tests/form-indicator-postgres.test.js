import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

dotenv.config({ quiet: true });
const { pool, shutdown } = await import('../src/db/pool.js');
const repository = await import('../src/repositories/indicatorValueRepository.js');
const responses = await import('../src/repositories/responseRepository.js');
const service = await import('../src/services/responseService.js');
const { processLinkedAnswers } = await import('../src/services/indicatorValueService.js');
const { institutionalCards } = await import('../src/repositories/dashboardRepository.js');
const { summary } = await import('../src/repositories/indicatorRepository.js');
const forms = await import('../src/repositories/formRepository.js');
const management = await import('../src/repositories/indicatorManagementRepository.js');
const { default: app } = await import('../src/app.js');

// Real migrated tables, constraints and timestamps; every fixture has unique IDs.
const year = 2196;
const sql = (text, params) => pool.query(text, params);
let ids;
let resident;
let admin;
const input = () => ({ responseId: ids.response, organizationId: ids.orgA, centerId: ids.centerA,
  year, month: 5, userId: ids.admin });
const answer = (value = '10') => ({ questionId: ids.question, questionType: 'NUMBER', indicator_id: ids.indicator, value });
const body = (value = '10') => ({ organizationId: ids.orgA, answers: [{ questionId: ids.question, value }] });
const publish = (value = '10') => service.submit(ids.form, body(value), resident);
const values = async (center = ids.centerA, indicator = ids.indicator) => (await sql(
  `SELECT * FROM indicator_values WHERE innovation_center_id=$1 AND indicator_id=$2 AND year=$3
   AND source_type='FORM_RESPONSE' AND deleted_at IS NULL ORDER BY month NULLS LAST`, [center, indicator, year])).rows;
const records = async () => (await sql('SELECT * FROM indicator_records WHERE indicator_id=$1 ORDER BY organization_id', [ids.indicator])).rows;
const consolidated = async () => (await values()).map((row) => [row.month, Number(row.numeric_value)]);

beforeEach(async () => {
  ids = Object.fromEntries(['admin', 'resident', 'residentB', 'orgA', 'orgB', 'centerA', 'centerB', 'form', 'question', 'other', 'indicator', 'response']
    .map((key) => [key, randomUUID()]));
  resident = { sub: ids.resident, role: 'RESIDENTE' };
  admin = { sub: ids.admin, role: 'ADMIN' };
  await sql(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at) VALUES
    ($1::uuid,'Admin',$1::text || '@pr105.invalid','unused','ADMIN','ACTIVE',NOW()),
    ($2::uuid,'Resident A',$2::text || '@pr105.invalid','unused','RESIDENTE','ACTIVE',NOW()),
    ($3::uuid,'Resident B',$3::text || '@pr105.invalid','unused','RESIDENTE','ACTIVE',NOW())`, [ids.admin, ids.resident, ids.residentB]);
  await sql(`INSERT INTO organizations(id,name,status) VALUES ($1,'A','ACTIVE'),($2,'B','ACTIVE')`, [ids.orgA, ids.orgB]);
  await sql('INSERT INTO users_organizations(user_id,organization_id) VALUES ($1,$3),($2,$4)', [ids.resident, ids.residentB, ids.orgA, ids.orgB]);
  await sql(`INSERT INTO innovation_centers(id,code,name) VALUES ($1::uuid,$1::text,'A'),($2::uuid,$2::text,'B')`, [ids.centerA, ids.centerB]);
  await sql(`INSERT INTO indicator_definitions(id,code,name,category,unit,value_type,periodicity,aggregation_type,annual_aggregation,calculation_type)
    VALUES ($1::uuid,$1::text,'Collected metric','PR105','UNIDADE','INTEGER','MONTHLY','SUM','SUM','MANUAL')`, [ids.indicator]);
  await sql(`INSERT INTO forms(id,title,status,created_by,start_date,end_date,innovation_center_id,indicator_year,indicator_month)
    VALUES ($1,'Collection','ACTIVE',$2,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day',$3,$4,5)`, [ids.form, ids.admin, ids.centerA, year]);
  await sql(`INSERT INTO questions(id,form_id,label,type,required,position) VALUES ($1,$3,'Mapped','NUMBER',FALSE,0),($2,$3,'Other','TEXT',FALSE,1)`, [ids.question, ids.other, ids.form]);
  await sql(`INSERT INTO question_indicator_links(question_id,indicator_id,aggregation_type,periodicity) VALUES ($1,$2,'SUM','MONTHLY')`, [ids.question, ids.indicator]);
  await sql('INSERT INTO form_organizations(form_id,organization_id) VALUES ($1,$2),($1,$3)', [ids.form, ids.orgA, ids.orgB]);
  await sql('INSERT INTO form_respondents(form_id,user_id,organization_id) VALUES ($1,$2,$4),($1,$3,$5)', [ids.form, ids.resident, ids.residentB, ids.orgA, ids.orgB]);
});

afterEach(async () => {
  await sql('DELETE FROM indicator_records WHERE innovation_center_id=ANY($1::uuid[])', [[ids.centerA, ids.centerB]]);
  await sql('DELETE FROM indicator_values WHERE innovation_center_id=ANY($1::uuid[])', [[ids.centerA, ids.centerB]]);
  await sql('DELETE FROM responses WHERE form_id=$1', [ids.form]);
  await sql('DELETE FROM forms WHERE id=$1', [ids.form]);
  await sql('DELETE FROM indicator_definitions WHERE id=$1', [ids.indicator]);
  await sql('DELETE FROM innovation_centers WHERE id=ANY($1::uuid[])', [[ids.centerA, ids.centerB]]);
  await sql('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [[ids.orgA, ids.orgB]]);
  await sql('DELETE FROM users WHERE id=ANY($1::uuid[])', [[ids.admin, ids.resident, ids.residentB]]);
});
afterAll(shutdown);

describe('form indicator contributions with real PostgreSQL in CI coverage', () => {
  it.each([
    ['SUM', 10, 30, 45, 20], ['COUNT', 1, 2, 2, 1],
    ['AVERAGE', 10, 15, 22.5, 20], ['LAST_VALUE', 10, 20, 25, 20],
  ])('%s consolidates one, many, changed, withdrawn and resubmitted answers', async (strategy, one, many, changed, withdrawn) => {
    await sql('UPDATE indicator_definitions SET aggregation_type=$2,annual_aggregation=$2 WHERE id=$1', [ids.indicator, strategy]);
    const first = await publish();
    expect(first.status).toBe('SUBMITTED');
    expect(await consolidated()).toEqual([[5, one], [null, one]]);
    const original = (await records())[0];
    expect(original).toMatchObject({ response_id: first.id, question_id: ids.question, organization_id: ids.orgA,
      indicator_id: ids.indicator, innovation_center_id: ids.centerA, record_type: 'FORM_RESPONSE',
      source_type: 'FORM_RESPONSE', year, month: 5, numeric_value: '10.0000', active: true, deleted_at: null });
    expect((await values()).every((row) => row.source_id === null && row.organization_id === null)).toBe(true);
    await service.submit(ids.form, { ...body('20'), organizationId: ids.orgB }, { sub: ids.residentB, role: 'RESIDENTE' });
    expect(await consolidated()).toEqual([[5, many], [null, many]]);
    const second = (await records()).find((r) => r.organization_id === ids.orgB);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const data = { ...input(), responseId: first.id, answers: [answer('25')] };
      await processLinkedAnswers(data, client);
      const afterChange = (await client.query('SELECT * FROM indicator_records WHERE id=$1', [original.id])).rows[0];
      expect(afterChange.numeric_value).toBe('25.0000');
      await client.query('COMMIT');
      await client.query('BEGIN');
      await processLinkedAnswers(data, client);
      expect((await client.query('SELECT * FROM indicator_records WHERE id=$1', [original.id])).rows[0]).toEqual(afterChange);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    expect(await consolidated()).toEqual([[5, changed], [null, changed]]);
    expect((await records()).find((r) => r.id === second.id)).toEqual(second);
    await service.reopen(first.id, admin);
    expect(await consolidated()).toEqual([[5, withdrawn], [null, withdrawn]]);
    expect((await records()).find((r) => r.id === original.id)).toMatchObject({ active: false });
    await publish('25');
    expect(await consolidated()).toEqual([[5, changed], [null, changed]]);
    expect(await records()).toHaveLength(2);
    expect((await records()).find((r) => r.id === original.id)).toMatchObject({ active: true, numeric_value: '25.0000', deleted_at: null });
  });

  it.each([['SUM', 30], ['COUNT', 2], ['AVERAGE', 15], ['LAST_VALUE', 20]])('%s annual competence uses form months, not submitted_at', async (strategy, annual) => {
    await sql('UPDATE indicator_definitions SET aggregation_type=$2,annual_aggregation=$2 WHERE id=$1', [ids.indicator, strategy]);
    const first = await publish();
    await sql("UPDATE responses SET submitted_at='2020-01-01' WHERE id=$1", [first.id]);
    await sql('UPDATE forms SET indicator_month=6 WHERE id=$1', [ids.form]);
    const second = await service.submit(ids.form, { ...body('20'), organizationId: ids.orgB }, { sub: ids.residentB, role: 'RESIDENTE' });
    const monthly = strategy === 'COUNT' ? [1, 1] : [10, 20];
    expect(await consolidated()).toEqual([[5, monthly[0]], [6, monthly[1]], [null, annual]]);
    expect((await values()).every((v) => v.year === year)).toBe(true);
    expect(Number((await summary({ year, centerId: ids.centerA })).find((v) => v.id === ids.indicator).value)).toBe(annual);
    await service.reopen(second.id, admin);
    expect(await consolidated()).toEqual([[5, monthly[0]], [null, monthly[0]]]);
  });

  it('reopening clears monthly/annual dashboard values and restores the same contribution without duplication', async () => {
    const first = await publish();
    const original = (await records())[0];
    const before = await values();
    expect(Number((await institutionalCards({ year, month: 5, centerId: ids.centerA })).find((v) => v.id === ids.indicator).numeric_value)).toBe(10);
    await service.reopen(first.id, admin);
    expect(await values()).toEqual([]);
    expect((await institutionalCards({ year, month: 5, centerId: ids.centerA })).find((v) => v.id === ids.indicator)).toBeUndefined();
    expect((await summary({ year, centerId: ids.centerA })).find((v) => v.id === ids.indicator).value).toBeNull();
    expect((await sql('SELECT deleted_at FROM indicator_values WHERE id=ANY($1::uuid[])', [before.map((v) => v.id)])).rows.every((v) => v.deleted_at)).toBe(true);
    await publish('25');
    expect(await consolidated()).toEqual([[5, 25], [null, 25]]);
    expect(await records()).toHaveLength(1);
    expect((await records())[0].id).toBe(original.id);
    expect(await responses.reopen(randomUUID(), ids.admin)).toBeUndefined();
  });

  it('reactivates soft-deleted contributions and returns affected indicators only once on withdrawal', async () => {
    const first = await publish();
    const record = (await records())[0];
    await sql('UPDATE indicator_records SET active=FALSE,deleted_at=NOW() WHERE id=$1', [record.id]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await processLinkedAnswers({ ...input(), responseId: first.id, answers: [answer('15')] }, client);
      expect((await client.query('SELECT * FROM indicator_records WHERE id=$1', [record.id])).rows[0]).toMatchObject({ active: true, deleted_at: null, numeric_value: '15.0000' });
      const affected = await repository.deactivateMissingContributions({ responseId: first.id, questionIds: [], userId: ids.admin }, client);
      expect(affected).toEqual([{ indicatorId: ids.indicator, centerId: ids.centerA, year, month: 5, code: ids.indicator }]);
      expect(await repository.deactivateMissingContributions({ responseId: first.id, questionIds: [], userId: ids.admin }, client)).toEqual([]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    expect(await values()).toEqual([]);
  });

  it('rolls back a reopening callback failure, including withdrawn contributions', async () => {
    const first = await publish();
    const before = await values();
    const error = new Error('publication dependency unavailable');
    await expect(responses.reopen(first.id, ids.admin, async (context, client) => {
      expect(context).toMatchObject({ organization_id: ids.orgA, innovation_center_id: ids.centerA, indicator_year: year, indicator_month: 5 });
      await processLinkedAnswers({ ...input(), responseId: first.id, answers: [] }, client);
      throw error;
    })).rejects.toBe(error);
    expect((await responses.findByFormAndOrganization(ids.form, ids.orgA)).status).toBe('SUBMITTED');
    expect(await values()).toEqual(before);
    expect((await records())[0].active).toBe(true);
    await service.reopen(first.id, admin);
    expect(await values()).toEqual([]);
  });

  it('rolls back a publication callback failure after a valid contribution has been written', async () => {
    const error = new Error('publication callback failed');
    let failedResponseId;
    await expect(responses.submit({ formId: ids.form, organizationId: ids.orgA, userId: ids.resident,
      answers: [answer()], processSubmission: async (responseId, client) => {
        failedResponseId = responseId;
        await processLinkedAnswers({ ...input(), responseId, answers: [answer()] }, client);
        throw error;
      } })).rejects.toBe(error);
    expect(await responses.findByFormAndOrganization(ids.form, ids.orgA)).toBeUndefined();
    expect(await records()).toEqual([]);
    expect(await values()).toEqual([]);
    expect(failedResponseId).toBeDefined();
    expect(await responses.getAnswers(failedResponseId)).toEqual([]);
    expect((await publish()).status).toBe('SUBMITTED');
  });

  it('saves a draft without contributions, then submits and rejects repeated submission', async () => {
    const draft = await service.saveDraft(ids.form, body(), resident);
    expect(await records()).toEqual([]);
    expect(await responses.getAnswers(draft.id)).toEqual([expect.objectContaining({ question_id: ids.question, value: '10' })]);
    const submitted = await publish('20');
    expect(submitted.id).toBe(draft.id);
    expect(await consolidated()).toEqual([[5, 20], [null, 20]]);
    expect(await responses.submit({ formId: ids.form, organizationId: ids.orgA, userId: ids.resident, answers: [] })).toEqual({ conflict: true });
    expect(await responses.history(ids.orgA)).toEqual([expect.objectContaining({ id: submitted.id, status: 'SUBMITTED' })]);
  });

  it.each(['membership', 'organization', 'recipient', 'mapping'])('honors inactive or missing %s instead of publishing a forged mapping', async (kind) => {
    if (kind === 'membership') await sql('UPDATE users_organizations SET active=FALSE WHERE user_id=$1', [ids.resident]);
    if (kind === 'organization') await sql("UPDATE organizations SET status='INACTIVE' WHERE id=$1", [ids.orgA]);
    if (kind === 'recipient') await sql('DELETE FROM form_organizations WHERE form_id=$1 AND organization_id=$2', [ids.form, ids.orgA]);
    if (kind === 'mapping') await sql('UPDATE question_indicator_links SET active=FALSE WHERE question_id=$1', [ids.question]);
    if (kind === 'mapping') {
      await service.submit(ids.form, { ...body(), indicatorId: ids.indicator, centerId: ids.centerB,
        answers: [{ questionId: ids.question, value: '10', indicatorId: ids.indicator, indicator_id: ids.indicator }] }, resident);
    } else {
      await expect(publish()).rejects.toMatchObject({ status: 403 });
    }
    expect(await values()).toEqual([]);
    expect(await values(ids.centerB)).toEqual([]);
    expect(await records()).toEqual([]);
  });

  it.each([5, 6])('blocks legacy month 5 when publishing month %s without backfill or overwrite', async (month) => {
    await sql('UPDATE forms SET indicator_month=$2 WHERE id=$1', [ids.form, month]);
    await sql(`INSERT INTO indicator_values(indicator_id,innovation_center_id,year,month,period_start,period_end,numeric_value,source_type,source_id)
      VALUES($1,$2,$3,5,make_date($3::int,5,1),make_date($3::int,5,31),99,'FORM_RESPONSE',$4)`, [ids.indicator, ids.centerA, year, ids.response]);
    const before = await values();
    await expect(publish()).rejects.toMatchObject({ status: 409, code: 'LEGACY_FORM_VALUES_REQUIRE_REVIEW' });
    expect(await values()).toEqual(before);
    expect(await records()).toEqual([]);
    expect(await responses.findByFormAndOrganization(ids.form, ids.orgA)).toBeUndefined();
    const client = await pool.connect();
    try {
      expect(await repository.hasLegacyFormValues({ ...input(), indicatorIds: [] }, client)).toBe(true);
      expect(await repository.hasLegacyFormValues({ ...input(), centerId: ids.centerB, indicatorIds: [ids.indicator] }, client)).toBe(false);
      expect(await repository.hasLegacyFormValues({ ...input(), year: year + 1, indicatorIds: [ids.indicator] }, client)).toBe(false);
      await sql('UPDATE indicator_values SET deleted_at=NOW() WHERE innovation_center_id=$1', [ids.centerA]);
      expect(await repository.hasLegacyFormValues({ ...input(), indicatorIds: [ids.indicator] }, client)).toBe(false);
    } finally { client.release(); }
  });

  it('clears monthly and annual derived values when a financial answer is withdrawn', async () => {
    const definitions = (await sql("SELECT id,code FROM indicator_definitions WHERE code IN ('RECEITA_TOTAL_CENTRO','DESPESAS_TOTAL_CENTRO','RESULTADO_ANUAL_CENTRO')")).rows;
    const id = (code) => definitions.find((row) => row.code === code).id;
    await sql('UPDATE question_indicator_links SET indicator_id=$2 WHERE question_id=$1', [ids.question, id('RECEITA_TOTAL_CENTRO')]);
    await sql("UPDATE questions SET type='DECIMAL' WHERE id=$1", [ids.other]);
    await sql("INSERT INTO question_indicator_links(question_id,indicator_id,aggregation_type,periodicity) VALUES($1,$2,'SUM','MONTHLY')", [ids.other, id('DESPESAS_TOTAL_CENTRO')]);
    const first = await service.submit(ids.form, { ...body('100'), answers: [{ questionId: ids.question, value: '100' }, { questionId: ids.other, value: '35' }] }, resident);
    const derived = async () => (await sql("SELECT month,numeric_value FROM indicator_values WHERE innovation_center_id=$1 AND indicator_id=$2 AND deleted_at IS NULL ORDER BY month NULLS LAST", [ids.centerA, id('RESULTADO_ANUAL_CENTRO')])).rows;
    expect(await derived()).toEqual([{ month: 5, numeric_value: '65.0000' }, { month: null, numeric_value: '65.0000' }]);
    await service.reopen(first.id, admin);
    expect(await derived()).toEqual([]);
    expect(await values(ids.centerA, id('RECEITA_TOTAL_CENTRO'))).toEqual([]);
    await publish('120');
    expect(await derived()).toEqual([]);
  });

  it('rejects generic FORM_RESPONSE creation and invalid record types with 422 while allowing EVENT', async () => {
    const authorization = `Bearer ${jwt.sign({ sub: ids.admin }, process.env.JWT_SECRET)}`;
    const base = '/api/indicator-management/records';
    for (const type of ['FORM_RESPONSE', 'INVALID_TYPE']) {
      const result = await request(app).post(`${base}/${type}`).set('Authorization', authorization)
        .send({ centerId: ids.centerA, name: 'Forged contribution', year, month: 5 });
      expect(result.status).toBe(422);
      expect(result.body.code).toBe('INVALID_RECORD_TYPE');
    }
    const event = await request(app).post(`${base}/EVENT`).set('Authorization', authorization)
      .send({ centerId: ids.centerA, name: 'Allowed event', eventAt: `${year}-05-10T12:00:00Z` });
    expect(event.status).toBe(201);
    expect(event.body).toMatchObject({ record_type: 'EVENT', name: 'Allowed event' });
    expect(await records()).toEqual([]);
  });

  it.each([
    ['value_type', 'TEXT'], ['value_type', 'BOOLEAN'], ['value_type', 'JSON'],
    ['aggregation_type', 'MANUAL'], ['annual_aggregation', 'DERIVED'],
  ])('catalog excludes collection rules with %s=%s', async (field, value) => {
    expect(await forms.indicatorDefinitions('PR105')).toEqual([expect.objectContaining({ id: ids.indicator })]);
    // Column names are fixed by the test matrix, never supplied by a request.
    await sql(`UPDATE indicator_definitions SET ${field}=$2 WHERE id=$1`, [ids.indicator, value]);
    expect(await forms.indicatorDefinitions('PR105')).toEqual([]);
    expect(await forms.findDefinitionById(ids.indicator)).toMatchObject({ [field]: value });
  });

  it('central calculation prefers form values over manual entries for the same month', async () => {
    await publish();
    await sql(`INSERT INTO indicator_values(indicator_id,innovation_center_id,year,month,period_start,period_end,numeric_value,source_type)
      VALUES($1,$2,$3,5,make_date($3::int,5,1),make_date($3::int,5,31),999,'MANUAL_ENTRY'),
      ($1,$2,$3,6,make_date($3::int,6,1),make_date($3::int,6,30),20,'MANUAL_ENTRY'),
      ($1,$4,$3,5,make_date($3::int,5,1),make_date($3::int,5,31),500,'MANUAL_ENTRY')`, [ids.indicator, ids.centerA, year, ids.centerB]);
    const collected = (await management.manualValuesForCalculation(ids.centerA, year)).filter((v) => v.indicator_id === ids.indicator);
    expect(collected.map((v) => [v.month, Number(v.numeric_value), v.source_type])).toEqual([[5, 10, 'FORM_RESPONSE'], [6, 20, 'MANUAL_ENTRY']]);
    expect(await repository.valueByCode(ids.indicator, ids.centerA, year, 5, pool)).toBe(10);
    expect(await repository.valueByCode(ids.indicator, ids.centerB, year, 5, pool)).toBe(500);
  });
});
