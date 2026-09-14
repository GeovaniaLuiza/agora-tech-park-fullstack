import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import app from '../../src/app.js';
import { query, shutdown } from '../../src/db/pool.js';

describe('PostgreSQL migrations and health', () => {
  afterAll(async () => shutdown());

  it('aplica todas as migrations e expõe banco disponível no health check', async () => {
    const directory = new URL('../../../database/migrations/', import.meta.url);
    const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    const migrations = await query('SELECT filename, checksum FROM schema_migrations ORDER BY filename');
    expect(migrations.rows.map((row) => row.filename)).toEqual(files);
    for (const row of migrations.rows) {
      const sql = await readFile(new URL(row.filename, directory), 'utf8');
      expect(row.checksum).toBe(createHash('sha256').update(sql, 'utf8').digest('hex'));
    }

    const requiredTables = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name = ANY($1::text[])
    `, [['users', 'forms', 'responses', 'notifications', 'form_respondents', 'indicator_definitions', 'indicator_values', 'question_indicator_links', 'indicator_import_batches']]);
    expect(requiredTables.rowCount).toBe(9);

    const columns = await query(`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND
        ((table_name='forms' AND column_name IN ('innovation_center_id','indicator_year','indicator_month'))
        OR (table_name='users' AND column_name='avatar_data'))`);
    expect(columns.rows).toEqual(expect.arrayContaining([
      { table_name: 'forms', column_name: 'innovation_center_id' },
      { table_name: 'forms', column_name: 'indicator_year' },
      { table_name: 'forms', column_name: 'indicator_month' },
      { table_name: 'users', column_name: 'avatar_data' },
    ]));


    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.services.database).toBe('up');
    expect(['ok', 'degraded']).toContain(response.body.status);
  });
});
