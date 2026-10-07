import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { query, shutdown } from '../../src/db/pool.js';
import { EVENT_HEADERS, RESIDENT_HEADERS, XLSX_MIME } from '../../src/domain/indicatorImportCatalog.js';

// Generated documents and invented companies; no source XLSX is used.
const syntheticCnpj = (base) => {
  let digits = base;
  for (const length of [12, 13]) {
    let sum = 0, weight = length - 7;
    for (const digit of digits) { sum += Number(digit) * weight; weight = weight === 2 ? 9 : weight - 1; }
    const remainder = sum % 11;
    digits += remainder < 2 ? '0' : String(11 - remainder);
  }
  return digits;
};
const workbook = async (type, rows) => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(type === 'EVENTS' ? 'Eventos' : 'Clientes');
  if (type === 'RESIDENTS') sheet.addRow([]);
  sheet.addRow(type === 'EVENTS' ? EVENT_HEADERS : RESIDENT_HEADERS);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
};

describe('XLSX → revisão → confirmação → Dashboard (PostgreSQL)', () => {
  const userId = randomUUID();
  const centers = [];
  let token, centerId;
  const call = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
  const upload = async (type, rows) => {
    const response = await call('post', `/api/indicator-imports/${type}/preview`)
      .query({ centerId, fileName: type === 'EVENTS' ? 'Eventos.xlsx' : 'Clientes.xlsx' })
      .set('Content-Type', XLSX_MIME).send(await workbook(type, rows));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body;
  };
  const review = async (batch, items) => {
    const response = await call('put', `/api/indicator-imports/batches/${batch.id}/review`).send({ items });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body;
  };
  const confirm = (batch) => call('post', `/api/indicator-imports/batches/${batch.id}/confirm`).send({});
  const dashboard = async (section, filters = {}) => {
    const response = await call('get', `/api/dashboard/${section}`).query({ centerId, year: 2026, ...filters });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body;
  };

  beforeAll(async () => {
    process.env.JWT_SECRET ||= 'synthetic-import-integration-secret';
    await query(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at)
      VALUES($1,'Admin sintético',$2,'unused','ADMIN','ACTIVE',NOW())`, [userId, `${userId}@example.invalid`]);
    token = jwt.sign({ sub: userId }, process.env.JWT_SECRET);
  });
  beforeEach(async () => {
    centerId = randomUUID(); centers.push(centerId);
    await query(`INSERT INTO innovation_centers(id,code,name,municipality,state)
      VALUES($1,$2,'Centro sintético','Cidade sintética','SC')`, [centerId, `TEST_${centerId}`]);
  });
  afterAll(async () => {
    try {
      await query('DELETE FROM audit_logs WHERE user_id=$1', [userId]);
      await query('DELETE FROM indicator_values WHERE innovation_center_id=ANY($1::uuid[])', [centers]);
      await query('DELETE FROM indicator_records WHERE innovation_center_id=ANY($1::uuid[])', [centers]);
      await query('DELETE FROM indicator_import_batches WHERE innovation_center_id=ANY($1::uuid[])', [centers]);
      await query('DELETE FROM innovation_centers WHERE id=ANY($1::uuid[])', [centers]);
      await query('DELETE FROM users WHERE id=$1', [userId]);
    } finally { await shutdown(); }
  });

  it('corrige CNPJ e Fim, preserva ocupações, exclui espaços e atualiza Dashboard imediatamente', async () => {
    const document = syntheticCnpj('731926480001');
    const batch = await upload('RESIDENTS', [
      ['Locada', 'Locador sintético', 'HUB', 'HUB 101', 50, 'Empresa sintética A', '', '01/01/2026', '30/04/20257', 'Pesquisa', 'Brasileira'],
      ['Locada', 'Locador sintético', 'UNI', 'UNI 201', 30, 'Empresa sintética A', document, '01/01/2026', '', 'Pesquisa', 'Brasileira'],
      ['Disponível', '', 'MOB', 'MOB 301', 20, '', '', '', '', '', ''],
      ['Áreas Comuns', '', 'HUB', 'Hall', 80, '', '', '', '', '', ''],
    ]);
    expect(batch.draft.items[0]).toMatchObject({ validationStatus: 'REVIEW_REQUIRED' });
    expect(batch.draft.items[0].issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['document', 'endInput']));
    expect((await confirm(batch)).status).toBe(422);
    expect((await query('SELECT id FROM indicator_records WHERE import_batch_id=$1', [batch.id])).rowCount).toBe(0);
    const revised = await review(batch, batch.draft.items.map((item) => item.sourceRows.includes(3)
      ? { ...item, document, contracts: item.contracts.map((contract) => ({ ...contract, endInput: '30/04/2026', sector: 'Pesquisa revisada', nationality: 'Sintética' })) } : item));
    const company = revised.draft.items.find((item) => item.document === document);
    expect(company).toMatchObject({ validationStatus: 'VALID', totalArea: 80 });
    expect(company.contracts).toHaveLength(2);
    expect(company.original.contracts[0].endInput).toBe('30/04/20257');
    const resumed = await call('get', '/api/indicator-imports/RESIDENTS/draft').query({ centerId });
    expect(resumed.body.draft.items.find((item) => item.document === document).contracts[0].endDate).toBe('2026-04-30');
    const result = await confirm(revised);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.summary).toMatchObject({ processed: 1, indicatorsUpdated: true, ignored: 2 });
    const records = await query('SELECT * FROM indicator_records WHERE import_batch_id=$1 AND active', [batch.id]);
    expect(records.rows).toHaveLength(1);
    expect(records.rows[0].extra.contracts).toHaveLength(2);
    expect(records.rows[0].extra.contracts[0].nationality).toBe('Sintética');
    const march = await dashboard('companies', { month: 3 });
    expect(march.cards.find((card) => card.code === 'EMPRESAS_RESIDENTES').value).toBe(1);
    expect(march.metrics).toMatchObject({ occupations: 2, area: 80 });
    const june = await dashboard('companies', { month: 6, sourceType: 'SPREADSHEET_IMPORT' });
    expect(june.cards.find((card) => card.code === 'EMPRESAS_RESIDENTES').value).toBe(1);
    expect(june.metrics).toMatchObject({ occupations: 1, area: 30 });
    expect((await confirm(revised)).status).toBe(200);
    expect((await query('SELECT id FROM indicator_records WHERE import_batch_id=$1 AND active', [batch.id])).rowCount).toBe(1);
    expect((await query("SELECT id FROM audit_logs WHERE entity_id=$1 AND action='INDICATOR_IMPORT_CONFIRMED'", [batch.id])).rowCount).toBe(1);
  });

  it('ignorar é explícito, restaurar reabre pendências, e exclusão não contamina outro CNPJ', async () => {
    const batch = await upload('RESIDENTS', [
      ['Locada', 'Locador', 'HUB', 'HUB 1', 10, 'Empresa sintética B', syntheticCnpj('837264190001'), '01/01/2026', '', '', ''],
      ['Locada', 'Locador', 'MOB', 'MOB 2', 20, 'Empresa sintética C', '', '01/01/2026', '30/04/20257', '', ''],
    ]);
    let revised = await review(batch, batch.draft.items.map((item, index) => index ? { ...item, included: false, reviewStatus: 'EXCLUDED' } : item));
    expect(revised.draft.items[1].validationStatus).toBe('IGNORED');
    revised = await review(revised, revised.draft.items.map((item, index) => index ? { ...item, included: true, reviewStatus: 'PENDING' } : item));
    expect(revised.draft.items[1].validationStatus).toBe('REVIEW_REQUIRED');
    expect((await confirm(revised)).status).toBe(422);
    revised = await review(revised, revised.draft.items.map((item, index) => index ? { ...item, included: false, reviewStatus: 'EXCLUDED' } : item));
    expect((await confirm(revised)).status).toBe(200);
    expect((await dashboard('companies', { month: 1 })).cards.find((card) => card.code === 'EMPRESAS_RESIDENTES').value).toBe(1);
  });

  it('revisa Eventos, soma participantes, filtra centro/período/origem/categoria e confirma concorrente sem duplicar', async () => {
    const batch = await upload('EVENTS', [
      ['Encontro sintético A', '30/04/20257', '', 'Pesquisa', 'Modo inválido', 'Encontro', 'erro', 'erro'],
      ['Encontro sintético B', '20/04/2026', 'MOB', '', 'Online', '', 12, 3],
      ['Encontro sintético C', '01/05/2026', 'UNI', '', 'Presencial', '', 5, 1],
      ['Ignorado sintético', 'inválida', '', '', '', '', '', ''],
    ]);
    expect(batch.draft.items[0].validationStatus).toBe('REVIEW_REQUIRED');
    expect((await confirm(batch)).status).toBe(422);
    const revised = await review(batch, batch.draft.items.map((item, index) => index === 3
      ? { ...item, included: false, reviewStatus: 'EXCLUDED' }
      : { ...item, included: true, ...(index === 0 ? { startAt: '2026-04-10', location: 'HUB', mode: 'HYBRID', participants: 20, participatingCompanies: 4, theme: 'Pesquisa revisada', subtype: 'Palestra' } : {}) }));
    expect(revised.draft.items[0].validationStatus).toBe('VALID');
    const results = await Promise.all([confirm(revised), confirm(revised)]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect((await query('SELECT id FROM indicator_records WHERE import_batch_id=$1 AND active', [batch.id])).rowCount).toBe(3);
    const april = await dashboard('engagement', { month: 4, sourceType: 'SPREADSHEET_IMPORT', category: 'Eventos' });
    expect(april.filters.month).toBe(4);
    expect(april.cards.find((card) => card.code === 'EVENTOS_REALIZADOS').value).toBe(2);
    expect(april.metrics).toMatchObject({ events: 2, participants: 32, participatingCompanies: 7 });
    expect((await dashboard('engagement', { month: 5 })).metrics).toMatchObject({ events: 1, participants: 5, participatingCompanies: 1 });
    expect((await dashboard('engagement', { month: 4, category: 'Empresas Residentes' })).metrics.events).toBe(0);
    expect((await dashboard('engagement', { month: 4, sourceType: 'FORM_RESPONSE' })).metrics.events).toBe(0);
    expect((await dashboard('engagement', { year: 2025 })).metrics.events).toBe(0);
    const otherCenter = (await query("SELECT id FROM innovation_centers WHERE code='CI_JOINVILLE'")).rows[0].id;
    const other = await dashboard('engagement', { centerId: otherCenter, month: 4 });
    expect(other.metrics.events).toBe(0);
    const annual = await dashboard('institutional-summary');
    expect(annual.cards.find((card) => card.code === 'EVENTOS_REALIZADOS').value).toBe(3);
    expect((await query(`SELECT indicator_id,month,source_type,COUNT(*) FROM indicator_values
      WHERE innovation_center_id=$1 AND deleted_at IS NULL GROUP BY indicator_id,month,source_type HAVING COUNT(*)>1`, [centerId])).rowCount).toBe(0);
  });

  it('não confirma uma pendência apenas desmarcada sem Ignorar registro', async () => {
    const batch = await upload('EVENTS', [
      ['Válido sintético', '10/04/2026', 'HUB', '', '', '', 1, 1],
      ['Pendente sintético', 'inválida', '', '', '', '', '', ''],
    ]);
    const revised = await review(batch, batch.draft.items.map((item, index) => ({ ...item, included: index === 0 })));
    expect((await confirm(revised)).body.code).toBe('REVIEW_REQUIRED');
    expect((await query('SELECT id FROM indicator_records WHERE import_batch_id=$1', [batch.id])).rowCount).toBe(0);
  });

  it('falha no recálculo desfaz registros, valores, finalização e auditoria e permite nova tentativa', async () => {
    const batch = await upload('EVENTS', [['Encontro rollback sintético', '01/01/2026', 'HUB', '', '', '', 10, 2]]);
    const revised = await review(batch, batch.draft.items.map((item) => ({ ...item, included: true })));
    const name = `test_import_failure_${randomUUID().replaceAll('-', '')}`;
    await query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.innovation_center_id='${centerId}'::uuid THEN RAISE EXCEPTION 'Falha sintética de recálculo'; END IF;
      RETURN NEW; END $$`);
    await query(`CREATE TRIGGER ${name} BEFORE INSERT ON indicator_values FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    try {
      expect((await confirm(revised)).status).toBe(500);
      expect((await query('SELECT id FROM indicator_records WHERE import_batch_id=$1', [batch.id])).rowCount).toBe(0);
      expect((await query('SELECT id FROM indicator_values WHERE innovation_center_id=$1', [centerId])).rowCount).toBe(0);
      expect((await query('SELECT status FROM indicator_import_batches WHERE id=$1', [batch.id])).rows[0].status).toBe('VALIDATED');
      expect((await query("SELECT id FROM audit_logs WHERE entity_id=$1 AND action='INDICATOR_IMPORT_CONFIRMED'", [batch.id])).rowCount).toBe(0);
    } finally {
      await query(`DROP TRIGGER ${name} ON indicator_values`);
      await query(`DROP FUNCTION ${name}()`);
    }
    expect((await confirm(revised)).status).toBe(200);
    expect((await dashboard('engagement', { month: 1 })).metrics).toMatchObject({ events: 1, participants: 10, participatingCompanies: 2 });
  });

  it('salva revisões maiores que o limite JSON geral sem perder registros', async () => {
    const batch = await upload('EVENTS', Array.from({ length: 120 }, (_, index) => [
      `Evento sintético ${index} ${'x'.repeat(160)}`, '15/04/2026', 'HUB', 'Pesquisa '.repeat(15), 'Presencial', 'Encontro', 1, 1,
    ]));
    const items = batch.draft.items.map((item) => ({ ...item, included: true }));
    expect(Buffer.byteLength(JSON.stringify({ items }))).toBeGreaterThan(100 * 1024);
    const revised = await review(batch, items);
    expect(revised.draft.items).toHaveLength(120);
    expect((await confirm(revised)).status).toBe(200);
    expect((await dashboard('engagement', { month: 4 })).metrics).toMatchObject({ events: 120, participants: 120, participatingCompanies: 120 });
  });
});
