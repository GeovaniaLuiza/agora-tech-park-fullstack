import pg from 'pg';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../src/db/pool.js', async (importOriginal) => ({
  ...await importOriginal(),
  query: db.query,
  pool: { query: db.query },
}));
import { list } from '../../src/controllers/indicatorController.js';
import { summary } from '../../src/repositories/indicatorRepository.js';
import { institutionalCards } from '../../src/repositories/dashboardRepository.js';

// Use connection-local temporary tables and rollback every test; institutional data stays intact.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const app = express();
app.get('/indicators', list);
const center = '00000000-0000-0000-0000-000000000001';
const otherCenter = '00000000-0000-0000-0000-000000000002';
async function value(code, numeric, source = 'FORM_RESPONSE', month = 1, year = 2026, centerId = center) {
  await client.query(`INSERT INTO indicator_values(indicator_id,innovation_center_id,year,month,period_start,period_end,numeric_value,source_type)
    SELECT id,$2,$3,$4,make_date($3,1,1),make_date($3,12,31),$5,$6 FROM indicator_definitions WHERE code=$1`,
  [code, centerId, year, month, numeric, source]);
}
describe('institutional catalog SQL and API', () => {
  beforeAll(async () => {
    await client.connect();
    db.query.mockImplementation((...args) => client.query(...args));
    await client.query(`CREATE TEMP TABLE indicator_definitions (LIKE public.indicator_definitions INCLUDING DEFAULTS);
      CREATE TEMP TABLE indicator_values (LIKE public.indicator_values INCLUDING DEFAULTS);
      CREATE TEMP TABLE innovation_centers (LIKE public.innovation_centers INCLUDING DEFAULTS);`);
  });
  beforeEach(async () => {
    await client.query('BEGIN');
    await client.query(`INSERT INTO innovation_centers(id,code,name) VALUES ($1,'A','Center A'),($2,'B','Center B')`, [center, otherCenter]);
    await client.query(`INSERT INTO indicator_definitions(code,name,category,unit,value_type,periodicity,aggregation_type,annual_aggregation)
      VALUES ('FORM_TEST','Projects submitted','Projects','UNIDADE','INTEGER','MONTHLY','SUM','SUM'),
        ('IMPORT_TEST','Events held','Events','UNIDADE','INTEGER','MONTHLY','SUM','SUM'),
        ('EMPTY_TEST','No data','Projects','UNIDADE','INTEGER','MONTHLY','SUM','SUM')`);
    await value('FORM_TEST', 5);
    await value('IMPORT_TEST', 3, 'SPREADSHEET_IMPORT');
  });
  afterEach(async () => { await client.query('ROLLBACK'); });
  afterAll(async () => { await client.end(); });

  it('API returns all 3 definitions: FORM, IMPORT and no value', async () => {
    const response = await request(app).get('/indicators').query({ centerId: center, period: '2026' });
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FORM_TEST', value: '5.0000', source: 'FORM_RESPONSE' }),
      expect.objectContaining({ code: 'IMPORT_TEST', value: '3.0000', source: 'SPREADSHEET_IMPORT' }),
      expect.objectContaining({ code: 'EMPTY_TEST', value: null, source: null, monthly_values: [] }),
    ]));
    expect(new Set(response.body.map((row) => row.id)).size).toBe(3);
  });
  it.each(['FORM_RESPONSE', 'SPREADSHEET_IMPORT', 'MANUAL_ENTRY', 'SYSTEM_CALCULATION'])('includes and filters %s', async (sourceType) => {
    await value('EMPTY_TEST', 7, sourceType);
    const rows = await summary({ year: 2026, centerId: center, sourceType });
    expect(rows.find((row) => row.code === 'EMPTY_TEST')).toMatchObject({ value: '7.0000', source: sourceType });
    expect(rows.every((row) => row.sources.every((source) => source === sourceType))).toBe(true);
  });
  it('center isolates values but keeps definitions', async () => {
    await value('FORM_TEST', 20, 'FORM_RESPONSE', 1, 2026, otherCenter);
    const rows = await summary({ year: 2026, centerId: otherCenter });
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.code === 'FORM_TEST').value).toBe('20.0000');
    expect(rows.find((row) => row.code === 'IMPORT_TEST').value).toBeNull();
  });
  it('year isolates values but keeps definitions', async () => {
    await value('FORM_TEST', 12, 'FORM_RESPONSE', 1, 2025);
    const rows = await summary({ period: '2025', centerId: center });
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.code === 'FORM_TEST').value).toBe('12.0000');
    expect(rows.find((row) => row.code === 'IMPORT_TEST').value).toBeNull();
  });
  it('returns the entire catalog when no values exist in the selected year', async () => {
    const rows = await summary({ year: 2027, centerId: center });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.value === null && row.source === null && row.monthly_values.length === 0)).toBe(true);
  });
  it('does not expose deleted values or inactive definitions', async () => {
    await client.query("UPDATE indicator_values SET deleted_at=NOW() WHERE indicator_id=(SELECT id FROM indicator_definitions WHERE code='FORM_TEST')");
    await client.query("UPDATE indicator_definitions SET active=FALSE WHERE code='IMPORT_TEST'");
    const rows = await summary({ year: 2026, centerId: center });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.code === 'FORM_TEST').value).toBeNull();
  });
  it('category includes definitions without data', async () => {
    expect((await summary({ year: 2026, centerId: center, category: 'Projects' })).map((row) => row.code).sort())
      .toEqual(['EMPTY_TEST', 'FORM_TEST']);
  });
  it.each(['projects', 'form_test'])('searches name/code: %s', async (name) => {
    expect((await summary({ year: 2026, centerId: center, name })).map((row) => row.code)).toEqual(['FORM_TEST']);
  });
  it('returns months, mixed sources and annual SUM without double-counting annual records', async () => {
    await value('FORM_TEST', 10, 'MANUAL_ENTRY', 2);
    await value('FORM_TEST', 999, 'FORM_RESPONSE', null);
    await value('FORM_TEST', 100, 'SPREADSHEET_IMPORT');
    const row = (await summary({ year: 2026, centerId: center })).find((item) => item.code === 'FORM_TEST');
    expect(row.value).toBe('15.0000');
    expect(row.sources.sort()).toEqual(['FORM_RESPONSE', 'MANUAL_ENTRY']);
    expect(row.monthly_values).toEqual([
      expect.objectContaining({ month: 1, value: 5, source: 'FORM_RESPONSE' }),
      expect.objectContaining({ month: 2, value: 10, source: 'MANUAL_ENTRY' }),
    ]);
    expect(row.updated_at).toBeTruthy();
    const monthly = (await summary({ period: '2026-02', centerId: center })).find((item) => item.code === 'FORM_TEST');
    expect(monthly.value).toBe('10.0000');
  });
  it.each([['AVERAGE', 7.5], ['LAST_VALUE', 10]])('annual %s follows the definition', async (rule, expected) => {
    await client.query("UPDATE indicator_definitions SET annual_aggregation=$1 WHERE code='FORM_TEST'", [rule]);
    await value('FORM_TEST', 10, 'FORM_RESPONSE', 2);
    expect(Number((await summary({ year: 2026, centerId: center })).find((row) => row.code === 'FORM_TEST').value)).toBe(expected);
  });
  it('does not assume SUM for an undefined numeric aggregation', async () => {
    await client.query("UPDATE indicator_definitions SET annual_aggregation=NULL,aggregation_type='MANUAL' WHERE code='FORM_TEST'");
    const row = (await summary({ year: 2026, centerId: center })).find((item) => item.code === 'FORM_TEST');
    expect(row.value).toBeNull();
    expect(row.monthly_values).toHaveLength(1);
  });
  it('uses an existing annual value for DERIVED instead of inferring a rule', async () => {
    await client.query("UPDATE indicator_definitions SET annual_aggregation='DERIVED' WHERE code='FORM_TEST'");
    await value('FORM_TEST', 30, 'SYSTEM_CALCULATION', null);
    const row = (await summary({ year: 2026, centerId: center })).find((item) => item.code === 'FORM_TEST');
    expect(row.value).toBe('30.0000');
    expect(row.source).toBe('SYSTEM_CALCULATION');
    expect(row.monthly_values).toHaveLength(1);
  });
  it('Dashboard uses the same annual consolidation and excludes missing values', async () => {
    await value('FORM_TEST', 10, 'MANUAL_ENTRY', 2);
    await value('FORM_TEST', 4, 'FORM_RESPONSE', 1, 2025);
    const cards = await institutionalCards({ year: 2026, centerId: center });
    expect(cards).toHaveLength(2);
    expect(cards.find((row) => row.code === 'FORM_TEST')).toMatchObject({ numeric_value: '15.0000', previous_numeric_value: '4.0000' });
  });
});
