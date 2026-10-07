import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventWorkbookFixture, residentWorkbookFixture } from './fixtures/indicator-import-workbooks.js';
import { XLSX_MIME } from '../src/domain/indicatorImportCatalog.js';

dotenv.config({ quiet: true });
const { pool, shutdown } = await import('../src/db/pool.js');
const { default: app } = await import('../src/app.js');
const schema = `import_confirm_${randomUUID().replaceAll('-', '')}`;
const adminId = randomUUID();
const centerId = randomUUID();
const tables = ['users', 'organizations', 'users_organizations', 'innovation_centers',
  'indicator_definitions', 'indicator_applicability', 'indicator_values', 'indicator_records',
  'indicator_import_batches', 'spreadsheet_imports', 'audit_logs'];
let setup;
let connect;
let token;
let querySpy;
let connectSpy;

beforeAll(async () => {
  setup = await pool.connect();
  await setup.query(`CREATE SCHEMA ${schema}`);
  await setup.query(`SET search_path TO ${schema}, public`);
  for (const table of tables) await setup.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  connect = pool.connect.bind(pool);
  process.env.JWT_SECRET ||= 'import-confirm-integration-secret-at-least-32-characters';
  token = jwt.sign({ sub: adminId }, process.env.JWT_SECRET);
});

beforeEach(async () => {
  querySpy = vi.spyOn(pool, 'query').mockImplementation((...args) => setup.query(...args));
  connectSpy = vi.spyOn(pool, 'connect').mockImplementation(async () => {
    const client = await connect();
    await client.query(`SET search_path TO ${schema}, public`);
    return client;
  });
  await setup.query(`TRUNCATE ${tables.join(', ')}`);
  await setup.query('INSERT INTO indicator_definitions SELECT * FROM public.indicator_definitions');
  await setup.query(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at)
    VALUES($1,'Import Admin','import-admin@test.invalid','hash','ADMIN','ACTIVE',NOW())`, [adminId]);
  await setup.query(`INSERT INTO innovation_centers(id,code,name) VALUES($1,'IMPORT_CENTER','Import Center')`, [centerId]);
});

afterAll(async () => {
  querySpy?.mockRestore();
  connectSpy?.mockRestore();
  if (setup) {
    await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    setup.release();
  }
  await shutdown();
});

const http = (method, path) => request(app)[method](path).set('Authorization', `Bearer ${token}`);
async function preview(type, buffer, reprocess = false) {
  const response = await http('post', `/api/indicator-imports/${type}/preview`)
    .query({ fileName: type === 'EVENTS' ? 'EVENTOS.xlsx' : 'Clientes.xlsx', centerId, reprocess })
    .set('Content-Type', XLSX_MIME).send(buffer);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body;
}
async function review(batch, select) {
  const response = await http('put', `/api/indicator-imports/batches/${batch.id}/review`)
    .send({ items: batch.draft.items.map((item, index) => ({
      ...item, included: select(item, index), reviewStatus: select(item, index) ? 'VALIDATED' : 'EXCLUDED',
    })) });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body;
}
const confirm = (id) => http('post', `/api/indicator-imports/batches/${id}/confirm`);
async function official(code, month) {
  const { rows } = await setup.query(`SELECT v.* FROM indicator_values v
    JOIN indicator_definitions d ON d.id=v.indicator_id
    WHERE d.code=$1 AND v.innovation_center_id=$2 AND v.year=2026
      AND v.month IS NOT DISTINCT FROM $3 AND v.deleted_at IS NULL
      AND v.source_type='SYSTEM_CALCULATION'`, [code, centerId, month]);
  expect(rows).toHaveLength(1);
  return rows[0];
}
async function assertScreens(code, value, month = null) {
  const indicators = await http('get', '/api/indicators').query({
    centerId, period: month ? `2026-${String(month).padStart(2, '0')}` : '2026',
  });
  expect(indicators.status).toBe(200);
  expect(Number(indicators.body.find((row) => row.code === code)?.value)).toBe(value);
  const dashboard = await http('get', '/api/dashboard/institutional-summary')
    .query({ centerId, year: 2026, ...(month ? { month } : {}) });
  expect(dashboard.status).toBe(200);
  expect(dashboard.body.cards.find((row) => row.code === code)?.value).toBe(value);
}

describe('Confirmar → fonte oficial → Indicadores e Dashboard (PostgreSQL real)', () => {
  it('persiste somente eventos considerados, com participantes e empresas, e publica valores idempotentes', async () => {
    const buffer = await eventWorkbookFixture();
    const batch = await review(await preview('EVENTS', buffer), (_item, index) => index === 0);
    const responses = await Promise.all([confirm(batch.id), confirm(batch.id)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const records = (await setup.query('SELECT * FROM indicator_records WHERE active AND deleted_at IS NULL')).rows;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ import_batch_id: batch.id, participants: 20, participating_companies: 3,
      innovation_center_id: centerId, source_rows: [2] });
    const monthly = await official('EVENTOS_REALIZADOS', 3);
    expect(Number(monthly.numeric_value)).toBe(1);
    expect(monthly.period_start.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(monthly.period_end.toISOString().slice(0, 10)).toBe('2026-03-31');
    expect(Number((await official('EVENTOS_REALIZADOS', 4)).numeric_value)).toBe(0);
    expect(Number((await official('EVENTOS_REALIZADOS', null)).numeric_value)).toBe(1);
    await assertScreens('EVENTOS_REALIZADOS', 1, 3);
    await assertScreens('EVENTOS_REALIZADOS', 1);
    expect((await confirm(batch.id)).status).toBe(409);
    const reprocessed = await review(await preview('EVENTS', buffer, true), (_item, index) => index === 0);
    expect((await confirm(reprocessed.id)).status).toBe(200);
    expect((await setup.query('SELECT SUM(participants)::int AS participants,SUM(participating_companies)::int AS companies,COUNT(*)::int AS events FROM indicator_records WHERE active AND deleted_at IS NULL')).rows[0])
      .toEqual({ participants: 20, companies: 3, events: 1 });
    await assertScreens('EVENTOS_REALIZADOS', 1);
    // These measures are details, not indicators in the existing official catalog.
    expect((await setup.query("SELECT code FROM indicator_definitions WHERE code IN ('PARTICIPANTES','EMPRESAS_PARTICIPANTES','AREA_OCUPADA','OCUPACOES')")).rows).toEqual([]);
  });

  it('consolida um CNPJ com duas ocupações, preserva área e publica um residente por competência', async () => {
    const buffer = await residentWorkbookFixture();
    const batch = await review(await preview('RESIDENTS', buffer), (item) => item.sourceRows.includes(3));
    const considered = batch.draft.items.filter((item) => item.included);
    expect(considered).toHaveLength(1);
    expect(considered[0].contracts).toHaveLength(2);
    const response = await confirm(batch.id);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const records = (await setup.query('SELECT * FROM indicator_records WHERE active AND deleted_at IS NULL')).rows;
    expect(records).toHaveLength(1);
    expect(records[0].extra.contracts).toHaveLength(2);
    expect(records[0].extra.totalArea).toBe(100);
    expect(Number((await official('EMPRESAS_RESIDENTES', 3)).numeric_value)).toBe(1);
    expect(Number((await official('EMPRESAS_RESIDENTES', null)).numeric_value)).toBe(1);
    await assertScreens('EMPRESAS_RESIDENTES', 1, 3);
    await assertScreens('EMPRESAS_RESIDENTES', 1);
    expect((await confirm(batch.id)).status).toBe(409);
    const reprocessed = await review(await preview('RESIDENTS', buffer, true), (item) => item.sourceRows.includes(3));
    expect((await confirm(reprocessed.id)).status).toBe(200);
    expect((await setup.query('SELECT extra FROM indicator_records WHERE active AND deleted_at IS NULL')).rows)
      .toEqual([expect.objectContaining({ extra: expect.objectContaining({ totalArea: 100, contracts: expect.any(Array) }) })]);
    await assertScreens('EMPRESAS_RESIDENTES', 1);
  });

  it('preserva cadastro manual do mesmo CNPJ e não duplica o estoque residente', async () => {
    const batch = await review(await preview('RESIDENTS', await residentWorkbookFixture()), (item) => item.sourceRows.includes(3));
    const resident = batch.draft.items.find((item) => item.included);
    const manual = (await setup.query(`INSERT INTO indicator_records(innovation_center_id,record_type,name,start_date,extra)
      VALUES($1,'RESIDENT_COMPANY','Cadastro manual','2026-01-01',$2::jsonb) RETURNING id`,
    [centerId, JSON.stringify({ documentHash: resident.documentHash, document: resident.document })])).rows[0];
    expect((await confirm(batch.id)).status).toBe(200);
    expect((await setup.query('SELECT active,deleted_at,import_batch_id FROM indicator_records WHERE id=$1', [manual.id])).rows[0])
      .toEqual({ active: true, deleted_at: null, import_batch_id: null });
    expect((await setup.query('SELECT id FROM indicator_records WHERE active AND deleted_at IS NULL')).rows).toHaveLength(2);
    await assertScreens('EMPRESAS_RESIDENTES', 1, 3);
    await assertScreens('EMPRESAS_RESIDENTES', 1);
  });

  it('reverte registros, valores e status se a gravação dos indicadores falhar e permite tentar novamente', async () => {
    const batch = await review(await preview('EVENTS', await eventWorkbookFixture()), (_item, index) => index === 0);
    await setup.query("ALTER TABLE indicator_values ADD CONSTRAINT reject_calculated_values CHECK (source_type <> 'SYSTEM_CALCULATION')");
    try {
      expect((await confirm(batch.id)).status).toBe(500);
      expect((await setup.query('SELECT * FROM indicator_records')).rows).toHaveLength(0);
      expect((await setup.query('SELECT * FROM indicator_values')).rows).toHaveLength(0);
      expect((await setup.query('SELECT status FROM indicator_import_batches WHERE id=$1', [batch.id])).rows[0].status).toBe(batch.status);
    } finally {
      await setup.query('ALTER TABLE indicator_values DROP CONSTRAINT reject_calculated_values');
    }
    expect((await confirm(batch.id)).status).toBe(200);
    await assertScreens('EVENTOS_REALIZADOS', 1);
  });

  it('preserva valores manuais e de formulário e mantém a precedência oficial de formulário', async () => {
    const batch = await review(await preview('EVENTS', await eventWorkbookFixture()), (_item, index) => index === 0);
    await setup.query(`INSERT INTO indicator_values(indicator_id,innovation_center_id,year,month,period_start,period_end,numeric_value,source_type)
      SELECT id,$1,2026,3,'2026-03-01','2026-03-31',42,source
      FROM indicator_definitions CROSS JOIN (VALUES ('MANUAL_ENTRY'),('FORM_RESPONSE')) s(source)
      WHERE code='EVENTOS_REALIZADOS'`, [centerId]);
    await setup.query(`INSERT INTO indicator_values(indicator_id,innovation_center_id,year,month,period_start,period_end,numeric_value,source_type)
      SELECT id,$1,2026,3,'2026-03-01','2026-03-31',77,'SYSTEM_CALCULATION'
      FROM indicator_definitions WHERE code='RESULTADO_ANUAL_CENTRO'`, [centerId]);
    expect((await confirm(batch.id)).status).toBe(200);
    expect(Number((await official('RESULTADO_ANUAL_CENTRO', 3)).numeric_value)).toBe(77);
    const preserved = await setup.query("SELECT numeric_value FROM indicator_values WHERE source_type IN ('MANUAL_ENTRY','FORM_RESPONSE') AND deleted_at IS NULL");
    expect(preserved.rows.map((row) => Number(row.numeric_value))).toEqual([42, 42]);
    expect(Number((await official('EVENTOS_REALIZADOS', 3)).numeric_value)).toBe(1);
    await assertScreens('EVENTOS_REALIZADOS', 42, 3);
  });
});
