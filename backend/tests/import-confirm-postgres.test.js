import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventWorkbookFixture, residentWorkbookFixture, residentHomologationWorkbookFixture, eventHomologationWorkbookFixture, reservationWorkbookFixture } from './fixtures/indicator-import-workbooks.js';
import { XLSX_MIME } from '../src/domain/indicatorImportCatalog.js';

dotenv.config({ quiet: true });
const { pool, shutdown } = await import('../src/db/pool.js');
const { default: app } = await import('../src/app.js');
const schema = `import_confirm_${randomUUID().replaceAll('-', '')}`;
const adminId = randomUUID();
const centerId = randomUUID();
const tables = ['users', 'organizations', 'users_organizations', 'innovation_centers',
  'indicator_definitions', 'indicator_applicability', 'indicator_values', 'indicator_records',
  'indicator_import_batches', 'spreadsheet_imports', 'audit_logs', 'forms', 'form_organizations', 'responses'];
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
const draft = (type = 'EVENTS') => http('get', `/api/indicator-imports/${type}/draft`).query({ centerId });
const cancel = (id) => http('post', `/api/indicator-imports/batches/${id}/cancel`).send({});
async function historicalBatch(current, status = 'VALIDATED') {
  const { rows } = await setup.query(`INSERT INTO indicator_import_batches(
    import_type,file_name,file_hash,file_size,mime_type,sheet_name,innovation_center_id,year,status,draft,created_by,created_at,is_current)
    SELECT import_type,'Historico.xlsx',file_hash,file_size,mime_type,sheet_name,innovation_center_id,year,$2,draft,created_by,
      created_at - interval '1 day',FALSE FROM indicator_import_batches WHERE id=$1 RETURNING *`, [current.id, status]);
  return rows[0];
}

describe('lote atual e auditoria com PostgreSQL real', () => {
  it('migration escolhe somente o mais recente e preserva status, decisões e lotes antigos', async () => {
    const current = await preview('EVENTS', await eventWorkbookFixture());
    const migration = await readFile(new URL('../../database/migrations/017_current_indicator_import.sql', import.meta.url), 'utf8');
    await setup.query('BEGIN');
    try {
      await setup.query('CREATE TEMP TABLE indicator_import_batches (LIKE public.indicator_import_batches INCLUDING ALL) ON COMMIT DROP');
      await setup.query('ALTER TABLE indicator_import_batches DROP COLUMN is_current');
      for (const [status, day] of [['VALIDATED', 1], ['WITH_WARNINGS', 2], ['REVIEW_PENDING', 3]]) {
        await setup.query(`INSERT INTO indicator_import_batches(import_type,file_name,file_hash,file_size,mime_type,sheet_name,innovation_center_id,year,status,draft,created_by,created_at,updated_at)
          SELECT import_type,file_name,file_hash,file_size,mime_type,sheet_name,innovation_center_id,year,$2,draft,created_by,
            make_timestamptz(2026,10,$3,12,0,0,'UTC'),make_timestamptz(2026,10,9,12,0,0,'UTC')
          FROM ${schema}.indicator_import_batches WHERE id=$1`, [current.id, status, day]);
      }
      const before = (await setup.query('SELECT id,status,draft,created_at FROM indicator_import_batches ORDER BY created_at')).rows;
      await setup.query(migration);
      expect((await setup.query('SELECT id,status,draft,created_at FROM indicator_import_batches ORDER BY created_at')).rows).toEqual(before);
      const marked = (await setup.query('SELECT id,status FROM indicator_import_batches WHERE is_current')).rows;
      expect(marked).toEqual([{ id: before[2].id, status: 'REVIEW_PENDING' }]);
      await setup.query("UPDATE indicator_import_batches SET status='IMPORTED' WHERE is_current");
      expect((await draft()).body).toBeNull();
    } finally { await setup.query('ROLLBACK'); }
  });

  it.each(['EVENTS', 'RESIDENTS'].flatMap((type) => ['VALIDATED', 'WITH_WARNINGS', 'REVIEW_PENDING'].map((status) => [type, status])))('retoma %s / %s preservando decisões', async (type, status) => {
    const current = await preview(type, await (type === 'EVENTS' ? eventWorkbookFixture() : residentWorkbookFixture()));
    await setup.query('UPDATE indicator_import_batches SET status=$2 WHERE id=$1', [current.id, status]);
    const response = await draft(type);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: current.id, status, draft: current.draft });
  });

  it.each(['EVENTS', 'RESIDENTS'].flatMap((type) => ['IMPORTED', 'CANCELLED', 'FAILED'].map((status) => [type, status])))('estado final %s / %s não ressuscita drafts históricos', async (type, status) => {
    const current = await preview(type, await (type === 'EVENTS' ? eventWorkbookFixture() : residentWorkbookFixture()));
    await historicalBatch(current);
    await setup.query('UPDATE indicator_import_batches SET status=$2 WHERE id=$1', [current.id, status]);
    expect((await draft(type)).body).toBeNull();
    expect((await setup.query('SELECT * FROM indicator_import_batches')).rows).toHaveLength(2);
  });

  it('vários pendentes históricos retornam somente a geração atual, mesmo após atualizar um antigo', async () => {
    const current = await preview('EVENTS', await eventWorkbookFixture());
    const old = await historicalBatch(current, 'REVIEW_PENDING');
    await historicalBatch(current, 'WITH_WARNINGS');
    await historicalBatch(current, 'VALIDATED');
    await setup.query("UPDATE indicator_import_batches SET updated_at=NOW()+interval '1 day' WHERE id=$1", [old.id]);
    expect((await draft()).body.id).toBe(current.id);
    expect((await setup.query('SELECT * FROM indicator_import_batches')).rows).toHaveLength(4);
    expect((await cancel(current.id)).status).toBe(200);
    expect((await draft()).body).toBeNull();
    expect((await setup.query("SELECT * FROM indicator_import_batches WHERE status IN ('REVIEW_PENDING','WITH_WARNINGS','VALIDATED')")).rows).toHaveLength(3);
  });

  it.each(['EVENTS', 'RESIDENTS'])('%s bloqueia novo upload, permite após descarte e preserva registros e valores confirmados', async (type) => {
    const buffer = await (type === 'EVENTS' ? eventWorkbookFixture() : residentWorkbookFixture());
    const confirmed = await review(await preview(type, buffer), (item, index) => type === 'EVENTS' ? index === 0 : item.sourceRows.includes(3));
    expect((await confirm(confirmed.id)).status).toBe(200);
    const recordsBefore = (await setup.query('SELECT * FROM indicator_records ORDER BY id')).rows;
    const valuesBefore = (await setup.query('SELECT * FROM indicator_values ORDER BY id')).rows;
    expect(recordsBefore.length).toBeGreaterThan(0);
    expect(valuesBefore.length).toBeGreaterThan(0);
    const current = await preview(type, buffer, true);
    const blocked = await http('post', `/api/indicator-imports/${type}/preview`).query({ centerId, fileName: 'Outro.xlsx', reprocess: true }).set('Content-Type', XLSX_MIME).send(buffer);
    expect(blocked.status).toBe(409); expect(blocked.body.code).toBe('IMPORT_ACTIVE_EXISTS');
    expect((await cancel(current.id)).body.status).toBe('CANCELLED');
    expect((await draft(type)).body).toBeNull();
    expect((await setup.query('SELECT * FROM indicator_records ORDER BY id')).rows).toEqual(recordsBefore);
    expect((await setup.query('SELECT * FROM indicator_values ORDER BY id')).rows).toEqual(valuesBefore);
    const next = await preview(type, buffer, true);
    expect(next.id).not.toBe(current.id);
    expect((await draft(type)).body.id).toBe(next.id);
    expect((await cancel(confirmed.id)).status).toBe(409);
    expect((await setup.query("SELECT * FROM audit_logs WHERE action='INDICATOR_IMPORT_CANCELLED'")).rows).toHaveLength(1);
  });

  it.each(['EVENTS', 'RESIDENTS'])('duas criações concorrentes de %s deixam apenas um lote atual', async (type) => {
    const buffer = await (type === 'EVENTS' ? eventWorkbookFixture() : residentWorkbookFixture());
    const upload = () => http('post', `/api/indicator-imports/${type}/preview`).query({ centerId, fileName: type === 'EVENTS' ? 'Eventos.xlsx' : 'Clientes.xlsx' }).set('Content-Type', XLSX_MIME).send(buffer);
    const responses = await Promise.all([upload(), upload()]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect((await setup.query('SELECT * FROM indicator_import_batches WHERE is_current')).rows).toHaveLength(1);
  });

  it('isola centro/tipo e compartilha a mesma retomada entre gestores', async () => {
    const events = await preview('EVENTS', await eventWorkbookFixture());
    const residents = await preview('RESIDENTS', await residentWorkbookFixture());
    const otherCenter = randomUUID();
    await setup.query("INSERT INTO innovation_centers(id,code,name) VALUES($1,'OTHER_IMPORT_CENTER','Outro centro')", [otherCenter]);
    const other = await http('post', '/api/indicator-imports/EVENTS/preview').query({ centerId: otherCenter, fileName: 'Eventos.xlsx' }).set('Content-Type', XLSX_MIME).send(await eventWorkbookFixture());
    expect(other.status).toBe(201);
    const otherManager = randomUUID();
    await setup.query(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at)
      VALUES($1,'Outro gestor','other-import-manager@test.invalid','hash','ADMIN','ACTIVE',NOW())`, [otherManager]);
    const otherToken = jwt.sign({ sub: otherManager }, process.env.JWT_SECRET);
    for (const [type, id] of [['EVENTS', events.id], ['RESIDENTS', residents.id]]) {
      const response = await request(app).get(`/api/indicator-imports/${type}/draft`).query({ centerId }).set('Authorization', `Bearer ${otherToken}`);
      expect(response.status).toBe(200); expect(response.body.id).toBe(id);
    }
    expect((await draft()).body.id).toBe(events.id);
    expect((await draft('RESIDENTS')).body.id).toBe(residents.id);
    expect((await setup.query('SELECT * FROM indicator_import_batches WHERE is_current')).rows).toHaveLength(3);
  });

  it('índice único recusa marcar dois lotes como atuais no mesmo centro/tipo', async () => {
    const current = await preview('EVENTS', await eventWorkbookFixture());
    const old = await historicalBatch(current);
    await expect(setup.query('UPDATE indicator_import_batches SET is_current=TRUE WHERE id=$1', [old.id])).rejects.toMatchObject({ code: '23505' });
    expect((await draft()).body.id).toBe(current.id);
  });
});
async function official(code, month) {
  const { rows } = await setup.query(`SELECT v.* FROM indicator_values v
    JOIN indicator_definitions d ON d.id=v.indicator_id
    WHERE d.code=$1 AND v.innovation_center_id=$2 AND v.year=2026
      AND v.month IS NOT DISTINCT FROM $3 AND v.deleted_at IS NULL
      AND v.source_type='SYSTEM_CALCULATION'`, [code, centerId, month]);
  expect(rows).toHaveLength(1);
  return rows[0];
}
async function assertScreens(code, value, month = null, officialValue = value) {
  const indicators = await http('get', '/api/indicators').query({
    centerId, period: month ? `2026-${String(month).padStart(2, '0')}` : '2026',
  });
  expect(indicators.status).toBe(200);
  expect(Number(indicators.body.find((row) => row.code === code)?.value)).toBe(value);
  const dashboard = await http('get', '/api/dashboard/institutional-summary')
    .query({ centerId, year: 2026, ...(month ? { month } : {}) });
  expect(dashboard.status).toBe(200);
  expect(dashboard.body.cards.find((row) => row.code === code)?.value).toBe(value);
  // Use the exact filters sent by /indicators, not only its default LIVE query.
  const page = await http('get', '/api/indicators').query({ centerId, year: 2026,
    sourceType: 'SPREADSHEET_IMPORT', officialDashboard: 'true',
    ...(month ? { period: `2026-${String(month).padStart(2, '0')}` } : {}) });
  expect(page.status).toBe(200);
  const row = page.body.find((item) => item.code === code);
  expect(Number(row?.value)).toBe(officialValue);
  expect(row.source).toBe('SYSTEM_CALCULATION');
}

describe('Confirmar → fonte oficial → Indicadores e Dashboard (PostgreSQL real)', () => {
  it('Exportação → revisão persistida → PostgreSQL → indicador mensal/anual, preserva Eventos e Residentes e reprocessa arquivos diferentes', async () => {
    const residents = await review(await preview('RESIDENTS', await residentWorkbookFixture()), item => item.sourceRows.includes(3));
    expect((await confirm(residents.id)).status).toBe(200);
    const residentRecords = (await setup.query("SELECT * FROM indicator_records WHERE record_type='RESIDENT_COMPANY' ORDER BY id")).rows;
    const residentValues = (await setup.query("SELECT v.* FROM indicator_values v JOIN indicator_definitions d ON d.id=v.indicator_id WHERE d.code='EMPRESAS_RESIDENTES' ORDER BY v.id")).rows;
    const old = await review(await preview('EVENTS', await eventWorkbookFixture()), (_item, index) => index === 0);
    expect((await confirm(old.id)).status).toBe(200);
    const oldRecords = (await setup.query("SELECT * FROM indicator_records WHERE record_type='EVENT' AND import_batch_id=$1", [old.id])).rows;
    const buffer = await reservationWorkbookFixture();
    const batch = await preview('EVENTS', buffer);
    expect(batch).toMatchObject({ sheetName: 'Exportação', summary: { rowsRead: 115, possibleEvents: 98, ignored: 3 } });
    const saved = await review(batch, item => item.validationStatus === 'VALID');
    const reloaded = await http('get', `/api/indicator-imports/batches/${batch.id}`);
    expect(reloaded.body.draft).toEqual(saved.draft);
    expect((await confirm(batch.id)).status).toBe(200);
    const imported = (await setup.query("SELECT * FROM indicator_records WHERE record_type='EVENT' AND active AND deleted_at IS NULL AND extra->>'sourceFormat'='RESERVATIONS'")).rows;
    expect(imported).toHaveLength(98);
    expect(imported.flatMap(record => record.extra.reservations)).toHaveLength(112);
    expect(imported.flatMap(record => record.extra.reservations).every(reservation => reservation.status === 'Confirmada')).toBe(true);
    expect(Number((await official('EVENTOS_REALIZADOS', 10)).numeric_value)).toBe(98);
    expect(Number((await official('EVENTOS_REALIZADOS', null)).numeric_value)).toBe(99);
    await assertScreens('EVENTOS_REALIZADOS', 98, 10);
    await assertScreens('EVENTOS_REALIZADOS', 99);
    const endpoint = '/api/indicator-imports/EVENTS/indicators';
    const october = await http('get', endpoint).query({ centerId, year: 2026, month: 10 });
    expect(october.body.records).toHaveLength(98);
    expect(october.body.total).toBe(99);
    expect((await http('get', endpoint).query({ centerId, year: 2026, month: 3 })).body.records).toHaveLength(1);
    expect((await http('get', endpoint).query({ centerId, year: 2025 })).body.records).toEqual([]);
    const otherCenter = randomUUID();
    await setup.query("INSERT INTO innovation_centers(id,code,name) VALUES($1,'OTHER_IMPORT','Outro centro')", [otherCenter]);
    expect((await http('get', endpoint).query({ centerId: otherCenter, year: 2026 })).body.records).toEqual([]);
    const same = await review(await preview('EVENTS', buffer, true), item => item.validationStatus === 'VALID');
    expect((await confirm(same.id)).status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Exportação');
    const rows = sheet.getRows(2, 115).map(row => row.values.slice(1)).reverse();
    sheet.spliceRows(2, 115, ...rows);
    const reordered = await review(await preview('EVENTS', Buffer.from(await workbook.xlsx.writeBuffer())), item => item.validationStatus === 'VALID');
    expect((await confirm(reordered.id)).status).toBe(200);
    expect((await setup.query("SELECT id FROM indicator_records WHERE record_type='EVENT' AND active AND deleted_at IS NULL")).rows).toHaveLength(99);
    expect((await setup.query("SELECT * FROM indicator_records WHERE import_batch_id=$1", [old.id])).rows).toEqual(oldRecords);
    expect((await setup.query("SELECT * FROM indicator_records WHERE record_type='RESIDENT_COMPANY' ORDER BY id")).rows).toEqual(residentRecords);
    expect((await setup.query("SELECT v.* FROM indicator_values v JOIN indicator_definitions d ON d.id=v.indicator_id WHERE d.code='EMPRESAS_RESIDENTES' ORDER BY v.id")).rows).toEqual(residentValues);
    await assertScreens('EVENTOS_REALIZADOS', 99);
  }, 20000);
  it('a visão oficial inclui os dois cálculos importados e preserva a origem dos demais indicadores', async () => {
    await setup.query(`INSERT INTO indicator_values(indicator_id,innovation_center_id,year,month,period_start,period_end,numeric_value,source_type)
      SELECT d.id,$1,2026,NULL,'2026-01-01','2026-12-31',v.value,v.source
      FROM indicator_definitions d JOIN (VALUES
        ('EMPRESAS_RESIDENTES',99,'SPREADSHEET_IMPORT'),('EMPRESAS_RESIDENTES',62,'SYSTEM_CALCULATION'),
        ('EVENTOS_REALIZADOS',1,'SPREADSHEET_IMPORT'),('EVENTOS_REALIZADOS',235,'SYSTEM_CALCULATION'),
        ('RECEITA_TOTAL_CENTRO',100,'SPREADSHEET_IMPORT'),('RECEITA_TOTAL_CENTRO',555,'SYSTEM_CALCULATION')
      ) v(code,value,source) ON d.code=v.code`, [centerId]);
    const raw = await http('get', '/api/indicators').query({ centerId, year: 2026, sourceType: 'SPREADSHEET_IMPORT' });
    expect(Number(raw.body.find(row => row.code === 'EMPRESAS_RESIDENTES').value)).toBe(99);
    const officialPage = await http('get', '/api/indicators').query({ centerId, year: 2026, sourceType: 'SPREADSHEET_IMPORT', officialDashboard: 'true' });
    for (const [code, value, source, basis] of [['EMPRESAS_RESIDENTES', 62, 'SYSTEM_CALCULATION', 'LAST_VALUE'], ['EVENTOS_REALIZADOS', 235, 'SYSTEM_CALCULATION', 'SUM'], ['RECEITA_TOTAL_CENTRO', 100, 'SPREADSHEET_IMPORT', 'RECORDED_ANNUAL']]) {
      const row = officialPage.body.find(item => item.code === code);
      expect(Number(row.value)).toBe(value);
      expect(row).toMatchObject({ source, consolidation_basis: basis });
    }
  });
  it('homologa os 235 Eventos e os 65 Residentes, preserva ambos e reprocessa sem duplicar', async () => {
    const residentsBuffer = await residentHomologationWorkbookFixture();
    const residents = await review(await preview('RESIDENTS', residentsBuffer), (item) => item.included && item.validationStatus !== 'REVIEW_REQUIRED');
    expect((await confirm(residents.id)).status).toBe(200);
    const residentIds = (await setup.query("SELECT id FROM indicator_records WHERE record_type='RESIDENT_COMPANY' AND active AND deleted_at IS NULL ORDER BY id")).rows;
    const residentValues = (await setup.query("SELECT v.* FROM indicator_values v JOIN indicator_definitions d ON d.id=v.indicator_id WHERE d.code='EMPRESAS_RESIDENTES' AND v.deleted_at IS NULL ORDER BY v.month NULLS LAST")).rows;
    const eventsBuffer = await eventHomologationWorkbookFixture();
    const original = await preview('EVENTS', eventsBuffer);
    expect(original.summary).toMatchObject({ records: 235, valid: 192, warnings: 43, needsReview: 0, ignored: 0, included: 0 });
    expect((await confirm(original.id)).body.code).toBe('NO_INCLUDED_RECORDS');
    const selected = await review(original, (item) => ['VALID', 'WARNING'].includes(item.validationStatus));
    expect(selected.summary).toMatchObject({ records: 235, valid: 192, warnings: 43, needsReview: 0, ignored: 0, included: 235 });
    const resumed = await http('get', '/api/indicator-imports/EVENTS/draft').query({ centerId });
    expect(resumed.body.draft.items).toEqual(selected.draft.items);
    const imported = await confirm(selected.id);
    expect(imported.status, JSON.stringify(imported.body)).toBe(200);
    expect(imported.body).toMatchObject({ status: 'IMPORTED', summary: { processed: 235, indicatorsUpdated: true } });
    const events = (await setup.query("SELECT * FROM indicator_records WHERE record_type='EVENT' AND active AND deleted_at IS NULL")).rows;
    expect(events).toHaveLength(235);
    for (const item of selected.draft.items) {
      const record = events.find((candidate) => candidate.extra.sourceKey === item.id);
      expect(record).toMatchObject({ innovation_center_id: centerId, import_batch_id: selected.id, source_rows: item.sourceRows,
        name: item.name, location: item.location, participants: item.participants, participating_companies: item.participatingCompanies });
      expect(record.event_at.toISOString()).toBe(item.startAt);
    }
    const monthly = [0, 0, 0, 0, 0, 0, 235, 0, 0, 0, 0, 0];
    for (let month = 1; month <= 12; month++) {
      expect(events.filter(record => record.event_at.getUTCMonth() + 1 === month)).toHaveLength(monthly[month - 1]);
      expect(Number((await official('EVENTOS_REALIZADOS', month)).numeric_value)).toBe(monthly[month - 1]);
      await assertScreens('EVENTOS_REALIZADOS', monthly[month - 1], month);
    }
    await assertScreens('EVENTOS_REALIZADOS', monthly.reduce((sum, value) => sum + value, 0));
    await assertScreens('EMPRESAS_RESIDENTES', 62);
    const engagement = await http('get', '/api/dashboard/engagement').query({ centerId, year: 2026, sourceType: 'LIVE' });
    expect(engagement.body.series.find(series => series.code === 'EVENTOS_REALIZADOS').points.map(point => point.value)).toEqual(monthly);
    const detailed = await http('get', '/api/indicator-imports/EVENTS/indicators').query({ centerId, year: 2026 });
    expect(detailed.body).toMatchObject({ monthly, total: 235 });
    expect(detailed.body.records).toHaveLength(235);
    const eventSnapshot = (await setup.query("SELECT * FROM indicator_records WHERE record_type='EVENT' ORDER BY id")).rows;
    const annualValueSnapshot = (await setup.query("SELECT v.* FROM indicator_values v JOIN indicator_definitions d ON d.id=v.indicator_id WHERE d.code='EVENTOS_REALIZADOS' ORDER BY v.id")).rows;
    for (const month of [1, 7, 1, 7]) {
      const filtered = await http('get', '/api/indicator-imports/EVENTS/indicators').query({ centerId, year: 2026, month });
      expect(filtered.status, JSON.stringify(filtered.body)).toBe(200);
      expect(filtered.body).toMatchObject({ month, monthly, total: 235 });
      expect(filtered.body.records).toHaveLength(month === 1 ? 0 : 235);
      expect(new Set(filtered.body.records.map(record => record.id)).size).toBe(filtered.body.records.length);
      if (month === 7) expect(filtered.body.records).toEqual(detailed.body.records);
    }
    expect((await setup.query("SELECT * FROM indicator_records WHERE record_type='EVENT' ORDER BY id")).rows).toEqual(eventSnapshot);
    expect((await setup.query("SELECT v.* FROM indicator_values v JOIN indicator_definitions d ON d.id=v.indicator_id WHERE d.code='EVENTOS_REALIZADOS' ORDER BY v.id")).rows).toEqual(annualValueSnapshot);
    const history = await http('get', '/api/indicators/history');
    expect(history.body).toContain('2026');
    const csv = await http('get', '/api/indicators/export/csv').query({ centerId, year: 2026, sourceType: 'SPREADSHEET_IMPORT', officialDashboard: 'true', codes: 'EMPRESAS_RESIDENTES,EVENTOS_REALIZADOS' });
    expect(csv.status).toBe(200);
    expect(csv.text).toMatch(/"235(?:\.0+)?"/);
    expect(csv.text).toMatch(/"62(?:\.0+)?"/);
    expect((await setup.query("SELECT id FROM indicator_records WHERE record_type='RESIDENT_COMPANY' AND active AND deleted_at IS NULL ORDER BY id")).rows).toEqual(residentIds);
    expect((await setup.query("SELECT v.* FROM indicator_values v JOIN indicator_definitions d ON d.id=v.indicator_id WHERE d.code='EMPRESAS_RESIDENTES' AND v.deleted_at IS NULL ORDER BY v.month NULLS LAST")).rows).toEqual(residentValues);
    const reprocessedEvents = await review(await preview('EVENTS', eventsBuffer, true), item => ['VALID', 'WARNING'].includes(item.validationStatus));
    expect((await confirm(reprocessedEvents.id)).status).toBe(200);
    expect((await setup.query("SELECT id FROM indicator_records WHERE record_type='EVENT' AND active AND deleted_at IS NULL")).rows).toHaveLength(235);
    expect((await setup.query("SELECT id FROM indicator_records WHERE record_type='RESIDENT_COMPANY' AND active AND deleted_at IS NULL ORDER BY id")).rows).toEqual(residentIds);
    const eventIds = (await setup.query("SELECT id FROM indicator_records WHERE record_type='EVENT' AND active AND deleted_at IS NULL ORDER BY id")).rows;
    const reprocessedResidents = await review(await preview('RESIDENTS', residentsBuffer, true), item => item.included && item.validationStatus !== 'REVIEW_REQUIRED');
    expect((await confirm(reprocessedResidents.id)).status).toBe(200);
    expect((await setup.query("SELECT id FROM indicator_records WHERE record_type='RESIDENT_COMPANY' AND active AND deleted_at IS NULL")).rows).toHaveLength(65);
    expect((await setup.query("SELECT id FROM indicator_records WHERE record_type='EVENT' AND active AND deleted_at IS NULL ORDER BY id")).rows).toEqual(eventIds);
    await assertScreens('EMPRESAS_RESIDENTES', 62);
    await assertScreens('EVENTOS_REALIZADOS', 235);
    const operational = await http('get', '/api/dashboard/operational-summary');
    expect(operational.status).toBe(200);
    expect(operational.body.active_organizations).toBe(0);
    // Import records feed institutional indicators, not the organizations registry.
    expect((await setup.query('SELECT COUNT(*)::int AS total FROM organizations')).rows[0].total).toBe(0);
  }, 30000);
  it('homologa Clientes.xlsx real: ignora somente 20 inválidos, retoma 65 incluídos e publica no Dashboard', async () => {
    const events = await review(await preview('EVENTS', await eventWorkbookFixture()), (_item, index) => index === 0);
    expect((await confirm(events.id)).status).toBe(200);
    const eventValue = await official('EVENTOS_REALIZADOS', 3);
    const buffer = await residentHomologationWorkbookFixture();
    const original = await preview('RESIDENTS', buffer);
    expect(original.summary).toMatchObject({ rowsRead: 163, companies: 85, uniqueCnpjs: 72,
      occupations: 121, valid: 65, warnings: 0, included: 85, needsReview: 20, ignored: 42 });
    expect(original.draft.items).toHaveLength(127);
    expect((await confirm(original.id)).body.code).toBe('REVIEW_REQUIRED');
    const saved = await review(original, (item) => item.included && item.validationStatus !== 'REVIEW_REQUIRED');
    expect(saved.summary).toMatchObject({ rowsRead: 163, companies: 85, uniqueCnpjs: 72,
      occupations: 121, valid: 65, warnings: 0, included: 65, needsReview: 0, ignored: 62 });
    const resumed = await http('get', '/api/indicator-imports/RESIDENTS/draft').query({ centerId });
    expect(resumed.status).toBe(200);
    expect(resumed.body.draft.items).toEqual(saved.draft.items);
    const included = resumed.body.draft.items.filter((item) => item.included);
    expect(included).toHaveLength(65);
    expect(included.every((item) => item.validationStatus === 'VALID' && !item.issues.length)).toBe(true);
    expect(resumed.body.draft.items.filter((item) => !item.included)).toHaveLength(62);
    expect(resumed.body.draft.items.filter((item) => !item.included && !item.ignored && item.reviewStatus !== 'EXCLUDED')).toEqual([]);
    const imported = await confirm(saved.id);
    expect(imported.status, JSON.stringify(imported.body)).toBe(200);
    expect(imported.body).toMatchObject({ status: 'IMPORTED', summary: { processed: 65, ignored: 62, indicatorsUpdated: true } });
    const records = (await setup.query("SELECT * FROM indicator_records WHERE record_type='RESIDENT_COMPANY' AND active AND deleted_at IS NULL")).rows;
    expect(records).toHaveLength(65);
    expect(new Set(records.map((record) => record.extra.document)).size).toBe(65);
    const contracts = records.flatMap((record) => record.extra.contracts);
    expect(contracts).toHaveLength(101);
    expect(Object.fromEntries(['HUB', 'MOB', 'UNI'].map((block) => [block, contracts.filter((contract) => contract.block === block).length])))
      .toEqual({ HUB: 31, MOB: 36, UNI: 34 });
    expect(records.every((record) => record.innovation_center_id === centerId && record.import_batch_id === saved.id)).toBe(true);
    for (const item of included) {
      const record = records.find((candidate) => candidate.extra.document === item.document);
      expect(record.extra.contracts).toEqual(item.contracts);
      expect(record.source_rows).toEqual(item.sourceRows);
      expect(record.start_date?.toISOString().slice(0, 10) ?? null).toBe(item.startDate);
      expect(record.end_date?.toISOString().slice(0, 10) ?? null).toBe(item.endDate);
    }
    const monthly = [53, 58, 61, 61, 61, 63, 64, 65, 65, 63, 63, 62];
    for (let month = 1; month <= 12; month += 1) {
      expect(Number((await official('EMPRESAS_RESIDENTES', month)).numeric_value)).toBe(monthly[month - 1]);
      await assertScreens('EMPRESAS_RESIDENTES', monthly[month - 1], month);
    }
    await assertScreens('EMPRESAS_RESIDENTES', 62);
    const detail = await http('get', '/api/indicator-imports/RESIDENTS/indicators').query({ centerId, year: 2026 });
    expect(detail.body.monthly).toEqual(monthly);
    expect(detail.body.records).toHaveLength(65);
    expect(detail.body.records.flatMap((record) => record.extra.contracts)).toHaveLength(101);
    const dashboard = await http('get', '/api/dashboard/companies').query({ centerId, year: 2026, sourceType: 'LIVE' });
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.series.find((series) => series.code === 'EMPRESAS_RESIDENTES').points.map((point) => point.value)).toEqual(monthly);
    expect(await official('EVENTOS_REALIZADOS', 3)).toEqual(eventValue);
    expect((await setup.query("SELECT id FROM indicator_records WHERE record_type='EVENT' AND active AND deleted_at IS NULL")).rows).toHaveLength(1);
  });
  it('Eventos.xlsx → revisão → confirmação → detalhamento por ano/mês com valores persistidos', async () => {
    const batch = await review(await preview('EVENTS', await eventWorkbookFixture()), (_item, index) => index === 0 || index === 2);
    const endpoint = '/api/indicator-imports/EVENTS/indicators';
    const before = await http('get', endpoint).query({ centerId, year: 2026 });
    expect(before.status).toBe(200);
    expect(before.body.records).toEqual([]);
    expect(before.body.total).toBe(0);
    expect((await confirm(batch.id)).status).toBe(200);
    const response = await http('get', endpoint).query({ centerId, year: 2026 });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.monthly).toEqual([0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(response.body.total).toBe(2);
    expect(response.body.records).toHaveLength(2);
    expect(response.body.records.map((record) => record.source_rows)).toEqual([[2], [4]]);
    expect(response.body.records.map((record) => [record.participants, record.participating_companies])).toEqual([[20, 3], [15, 2]]);
    for (const month of [3, 4]) {
      const filtered = await http('get', endpoint).query({ centerId, year: 2026, month });
      expect(filtered.body.records).toHaveLength(1);
      expect(filtered.body.total).toBe(2);
      expect(Number((await official('EVENTOS_REALIZADOS', month)).numeric_value)).toBe(response.body.monthly[month - 1]);
    }
    expect(Number((await official('EVENTOS_REALIZADOS', null)).numeric_value)).toBe(response.body.total);
    const otherYear = await http('get', endpoint).query({ centerId, year: 2025 });
    expect(otherYear.body.records).toEqual([]);
    expect(otherYear.body.total).toBe(0);
    expect((await confirm(batch.id)).status).toBe(409);
    expect((await http('get', endpoint).query({ centerId, year: 2026 })).body.total).toBe(2);
  });
  it('Clientes.xlsx → confirmação → CNPJ consolidado, ocupações e entrada/saída intermediárias', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await residentWorkbookFixture());
    const sheet = workbook.getWorksheet('Clientes');
    sheet.getCell('H5').value = '15/06/2026';
    sheet.getCell('I5').value = '12/09/2026';
    const batch = await review(await preview('RESIDENTS', Buffer.from(await workbook.xlsx.writeBuffer())), (item) => item.sourceRows.includes(3) || item.sourceRows.includes(5));
    expect((await confirm(batch.id)).status).toBe(200);
    const endpoint = '/api/indicator-imports/RESIDENTS/indicators';
    const response = await http('get', endpoint).query({ centerId, year: 2026 });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.monthly).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1]);
    expect(response.body.total).toBe(1);
    expect(response.body.records).toHaveLength(2);
    const occupations = response.body.records.flatMap((record) => record.extra.contracts);
    expect(occupations).toHaveLength(3);
    expect(occupations.map((contract) => contract.block).sort()).toEqual(['HUB', 'MOB', 'UNI']);
    expect(occupations.every((contract) => !['Disponível', 'Áreas Comuns'].includes(contract.legend))).toBe(true);
    for (let month = 1; month <= 12; month += 1) expect(Number((await official('EMPRESAS_RESIDENTES', month)).numeric_value)).toBe(response.body.monthly[month - 1]);
    expect(Number((await official('EMPRESAS_RESIDENTES', null)).numeric_value)).toBe(response.body.total);
    const june = await http('get', endpoint).query({ centerId, year: 2026, month: 6 });
    expect(june.body.records).toHaveLength(2);
    const october = await http('get', endpoint).query({ centerId, year: 2026, month: 10 });
    expect(october.body.records).toHaveLength(1);
    expect(october.body.records[0].extra.contracts).toHaveLength(2);
  });
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
    await assertScreens('EVENTOS_REALIZADOS', 42, 3, 1);
  });
});
