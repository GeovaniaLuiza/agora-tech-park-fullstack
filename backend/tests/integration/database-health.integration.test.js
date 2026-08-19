import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { query, shutdown } from '../../src/db/pool.js';

describe('PostgreSQL migrations and health', () => {
  afterAll(async () => shutdown());

  it('aplica todas as migrations e expõe banco disponível no health check', async () => {
    const migrations = await query('SELECT filename FROM schema_migrations ORDER BY filename');
    expect(migrations.rows.at(-1)?.filename).toBe('014_form_indicator_collection.sql');

    const requiredTables = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name = ANY($1::text[])
    `, [['users', 'forms', 'responses', 'notifications', 'form_respondents', 'indicator_definitions', 'indicator_values', 'question_indicator_links']]);
    expect(requiredTables.rowCount).toBe(8);


    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.services.database).toBe('up');
    expect(['ok', 'degraded']).toContain(response.body.status);
  });
});
