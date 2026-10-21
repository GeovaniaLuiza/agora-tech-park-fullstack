import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { query } from '../db/pool.js';

const migration = '022_user_session_version.sql';

function notReady() {
  return Object.assign(new Error(`Session schema is not ready. Apply the versioned ${migration} migration before starting the API.`), {
    code: 'SESSION_SCHEMA_NOT_READY',
  });
}

// Read-only startup gate: never run migrations implicitly or accept sessions
// while their persistent revocation state is missing/incompatible.
export async function assertSessionSchemaReady() {
  const sql = await readFile(new URL(`../../../database/migrations/${migration}`, import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
  const metadata = await query("SELECT to_regclass('schema_migrations') AS migrations_table");
  if (!metadata.rows[0]?.migrations_table) throw notReady();
  const applied = await query('SELECT checksum FROM schema_migrations WHERE filename=$1', [migration]);
  if (applied.rows[0]?.checksum !== checksum) throw notReady();
  const column = await query(`SELECT a.atttypid='integer'::regtype AND a.attnotnull
      AND pg_get_expr(d.adbin,d.adrelid)='0' AS valid
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=to_regclass('users') AND a.attname='session_version' AND NOT a.attisdropped`);
  if (column.rows[0]?.valid !== true) throw notReady();
}
