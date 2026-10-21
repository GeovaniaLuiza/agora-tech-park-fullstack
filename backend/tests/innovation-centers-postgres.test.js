import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import names from './fixtures/innovation-center-names.json' with { type: 'json' };

// Keep real authentication/authorization; isolate only profile lookup from unrelated tables.
const profile = vi.hoisted(() => { const findPublicProfile = vi.fn(); return { findPublicProfile, findAuthenticationProfile: findPublicProfile }; });
vi.mock('../src/repositories/userRepository.js', () => profile);
dotenv.config({ quiet: true });
const { pool, shutdown } = await import('../src/db/pool.js');
const { listCenters } = await import('../src/repositories/indicatorManagementRepository.js');
const indicatorRepository = await import('../src/repositories/indicatorRepository.js');
const dashboardRepository = await import('../src/repositories/dashboardRepository.js');
const { default: routes } = await import('../src/routes/indicatorManagementRoutes.js');
const app = express();
app.use('/api/indicator-management', routes);
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
const schema = `centers_${randomUUID().replaceAll('-', '')}`;
const joinvilleId = randomUUID();
const tables = ['innovation_centers', 'indicator_values', 'indicator_records', 'indicator_import_batches'];
const migration = await readFile(new URL('../../database/migrations/018_innovation_center_catalog.sql', import.meta.url), 'utf8');
let setup;
let querySpy;
let token;

beforeAll(async () => {
  setup = await pool.connect();
  await setup.query(`CREATE SCHEMA ${schema}`);
  await setup.query(`SET search_path TO ${schema}, public`);
  for (const table of tables) await setup.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  process.env.JWT_SECRET ||= 'centers-test-secret-with-at-least-32-characters';
  token = jwt.sign({ sub: randomUUID() }, process.env.JWT_SECRET);
});

beforeEach(async () => {
  querySpy = vi.spyOn(pool, 'query').mockImplementation((...args) => setup.query(...args));
  await setup.query(`TRUNCATE ${tables.join(', ')}`);
  await setup.query("INSERT INTO innovation_centers(id,code,name,municipality,state) VALUES($1,'CI_JOINVILLE',$2,'Joinville','SC')", [joinvilleId, names[10]]);
  profile.findPublicProfile.mockResolvedValue({ id: randomUUID(), role: 'ADMIN', status: 'ACTIVE', session_version: 0, email_verified_at: new Date(), organizations: [{}] });
});

afterAll(async () => {
  querySpy?.mockRestore();
  if (setup) {
    await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    setup.release();
  }
  await shutdown();
});

const get = () => request(app).get('/api/indicator-management/innovation-centers').set('Authorization', `Bearer ${token}`);

describe('shared innovation center catalog migration and API', () => {
  it('defaults indicator summaries, dashboard series and reports to Joinville, honoring explicit centers', async () => {
    await setup.query(migration);
    const blumenau = (await setup.query("SELECT id FROM innovation_centers WHERE code='CI_BLUMENAU'")).rows[0].id;
    const definition = (await setup.query('SELECT id,code FROM public.indicator_definitions WHERE active LIMIT 1')).rows[0];
    await setup.query(`INSERT INTO indicator_values(indicator_id,innovation_center_id,year,month,period_start,period_end,numeric_value,source_type)
      VALUES($1,$2,2026,1,'2026-01-01','2026-01-31',7,'MANUAL_ENTRY'),
            ($1,$3,2026,1,'2026-01-01','2026-01-31',99,'MANUAL_ENTRY')`, [definition.id, joinvilleId, blumenau]);
    const snapshot = (await setup.query('SELECT * FROM indicator_values ORDER BY id')).rows;
    for (const [centerId, expected] of [[undefined, 7], [blumenau, 99]]) {
      const filters = { year: 2026, sourceType: 'LIVE', ...(centerId ? { centerId } : {}) };
      const summary = await indicatorRepository.summary(filters);
      const value = summary.find((item) => item.id === definition.id);
      expect(Number(value.value)).toBe(expected);
      expect(value.center_name).toBe(centerId ? names[2] : names[10]);
      const series = await dashboardRepository.series([definition.code], filters);
      expect(series).toHaveLength(1);
      expect(Number(series[0].numeric_value)).toBe(expected);
      const report = await dashboardRepository.indicatorReportRows(filters);
      expect(report).toHaveLength(1);
      expect(Number(report[0].numeric_value)).toBe(expected);
    }
    expect((await setup.query('SELECT * FROM indicator_values ORDER BY id')).rows).toEqual(snapshot);
    expect((await setup.query("SELECT id FROM innovation_centers WHERE code='CI_JOINVILLE'")).rows[0].id).toBe(joinvilleId);
    await setup.query("UPDATE innovation_centers SET active=FALSE WHERE code='CI_JOINVILLE'");
    expect(await dashboardRepository.series([definition.code], { year: 2026, sourceType: 'LIVE' })).toEqual([]);
    expect(await dashboardRepository.indicatorReportRows({ year: 2026, sourceType: 'LIVE' })).toEqual([]);
  });
  it('adds the 16 expected active centers once, preserving Joinville and all linked data', async () => {
    await setup.query(`INSERT INTO indicator_values(indicator_id,innovation_center_id,year,month,period_start,period_end,numeric_value,source_type)
      SELECT id,$1,2026,1,'2026-01-01','2026-01-31',7,'MANUAL_ENTRY' FROM public.indicator_definitions LIMIT 1`, [joinvilleId]);
    await setup.query("INSERT INTO indicator_records(innovation_center_id,record_type,name) VALUES($1,'EVENT','Existing event')", [joinvilleId]);
    await setup.query(`INSERT INTO indicator_import_batches(import_type,file_name,file_hash,file_size,mime_type,sheet_name,innovation_center_id,year,status)
      VALUES('EVENTS','existing.xlsx',repeat('a',64),1,'application/test','Eventos',$1,2026,'IMPORTED')`, [joinvilleId]);
    const before = [];
    for (const table of tables) before.push((await setup.query(`SELECT * FROM ${table} ORDER BY id`)).rows);
    expect(before[1]).toHaveLength(1);
    await setup.query(migration);
    const first = await listCenters();
    await setup.query(migration);
    expect(await listCenters()).toEqual(first);
    expect(first).toHaveLength(16);
    expect(first.map((center) => center.name).sort()).toEqual([...names].sort());
    expect(first.every((center) => center.active && center.state === 'SC')).toBe(true);
    expect(first.filter((center) => center.name === names[10])).toHaveLength(1);
    expect(first.find((center) => center.code === 'CI_JOINVILLE').id).toBe(joinvilleId);
    expect((await setup.query('SELECT * FROM innovation_centers WHERE id=$1', [joinvilleId])).rows).toEqual(before[0]);
    for (let index = 1; index < tables.length; index++) {
      expect((await setup.query(`SELECT * FROM ${tables[index]} ORDER BY id`)).rows).toEqual(before[index]);
    }
    await setup.query("INSERT INTO innovation_centers(code,name,active) VALUES('INACTIVE','Inactive center',FALSE)");
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.body.map((center) => center.name).sort()).toEqual([...names].sort());
    expect((await listCenters({ includeInactive: true }))).toHaveLength(17);
  });

  it('preserves a manually registered center with the same normalized name and another code', async () => {
    const manualId = randomUUID();
    const manualName = `  ${names[0].toUpperCase()}  `;
    await setup.query("INSERT INTO innovation_centers(id,code,name) VALUES($1,'MANUAL_FLORIPA',$2)", [manualId, manualName]);
    await setup.query(migration);
    await setup.query(migration);
    const centers = await listCenters();
    expect(centers).toHaveLength(16);
    expect(centers.find((center) => center.id === manualId)).toMatchObject({ code: 'MANUAL_FLORIPA', name: manualName });
    expect(centers.some((center) => center.code === 'CI_FLORIANOPOLIS')).toBe(false);
  });

  it('preserves inactive registrations instead of duplicating or reactivating them', async () => {
    await setup.query("INSERT INTO innovation_centers(code,name,active) VALUES('CI_BLUMENAU',$1,FALSE)", [names[2]]);
    await setup.query(migration);
    expect(await listCenters()).toHaveLength(15);
    expect(await listCenters({ includeInactive: true })).toHaveLength(16);
  });

  it.each(['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE'])('keeps catalog access for %s and admin-only writes', async (role) => {
    await setup.query(migration);
    const user = await profile.findPublicProfile();
    profile.findPublicProfile.mockResolvedValue({ ...user, role });
    expect((await get()).status).toBe(200);
    if (role !== 'ADMIN') {
      const response = await request(app).post('/api/indicator-management/innovation-centers').set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    }
    expect((await request(app).get('/api/indicator-management/innovation-centers')).status).toBe(401);
  });
});
