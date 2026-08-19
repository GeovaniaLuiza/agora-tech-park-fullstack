import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config(); // expects backend/.env when run from backend folder

const DEFAULTS = {
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 5000,
};

if (!process.env.DATABASE_URL) {
  throw new Error('ERROR: DATABASE_URL is not set in environment. Aborting.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ...DEFAULTS });

// Resolve migrations directory relative to this script file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../../database/migrations');

function fileChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function inspectMigrationsTable(client) {
  // Returns metadata about schema_migrations table without modifying DB
  const res = await client.query("SELECT to_regclass('public.schema_migrations') as exists");
  const exists = !!(res.rows[0] && res.rows[0].exists);
  const info = { exists, columns: [], requiresBaseline: false, canonical: false };
  if (!exists) return info;

  const cols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='schema_migrations'");
  info.columns = cols.rows.map(r => r.column_name);
  info.canonical = ['id','filename','checksum','applied_at'].every(c => info.columns.includes(c));

  // Check for any rows with checksum IS NULL (legacy metadata)
  if (info.columns.includes('checksum')) {
    const nullCheck = await client.query('SELECT COUNT(*)::int AS cnt FROM schema_migrations WHERE checksum IS NULL');
    if (Number(nullCheck.rows[0]?.cnt) > 0) info.requiresBaseline = true;
  } else {
    info.requiresBaseline = true;
  }

  return info;
}

function splitEnumAdditions(sql) {
  // PostgreSQL requires a newly-added enum value to be committed before it is
  // used. Legacy migration 004 contains both operations in one file.
  const enumAdditionPattern = /ALTER\s+TYPE\s+[\w."]+\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:'[^']+'|"[^"]+")(?:\s+(?:BEFORE|AFTER)\s+(?:'[^']+'|"[^"]+"))?\s*;/gi;
  const enumAdditions = [...sql.matchAll(enumAdditionPattern)].map((match) => match[0]);
  return {
    enumAdditions,
    transactionalSql: sql.replace(enumAdditionPattern, '').trim(),
  };
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function detectCoreObjects(client) {
  const required = [ 'users','organizations','forms','questions','responses','answers','indicators','indicator_definitions','indicator_values','audit_logs','spreadsheet_imports' ];
  const present = [];
  for (const t of required) {
    const { rows } = await client.query("SELECT to_regclass('public." + t + "') as exists;");
    if (rows[0] && rows[0].exists) present.push(t);
  }
  return present;
}

function parseMigrationFiles(files) {
  // Expect files named with numeric prefix like 001_name.sql
  const parsed = files.map(f => {
    const m = f.match(/^(0*)(\d+)_/);
    if (!m) return null;
    const num = Number(m[2]);
    return { file: f, num };
  });

  const invalid = files.filter((f, i) => parsed[i] === null);
  if (invalid.length > 0) {
    throw new Error(`Found SQL files without numeric prefix: ${invalid.join(', ')}. Rename or remove them.`);
  }

  return parsed.sort((a,b) => a.num - b.num).map(p => p.file);
}

async function getAppliedMigrationsMap(client) {
  const { rows } = await client.query('SELECT filename, checksum FROM schema_migrations');
  const m = new Map();
  for (const r of rows) m.set(r.filename, r.checksum);
  return m;
}

async function acquireAdvisoryLock(client) {
  // Use a fixed 64-bit key; document this constant
  const LOCK_KEY = 9876543210n;
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
  return LOCK_KEY;
}

async function releaseAdvisoryLock(client, key) {
  await client.query('SELECT pg_advisory_unlock($1)', [key]);
}

async function runDryRun() {
  const client = await pool.connect();
  try {
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    const ordered = parseMigrationFiles(migrationFiles);

    // Inspect schema_migrations without creating it
    const inspect = await inspectMigrationsTable(client);
    const presentObjects = await detectCoreObjects(client);
    if (!inspect.exists && presentObjects.length > 0) {
      throw new Error('Existing/legacy database detected. Run migrate:baseline before deploying.');
    }
    if (inspect.requiresBaseline) {
      throw new Error('Legacy migration metadata detected. Run migrate:baseline before deploying.');
    }
    if (!inspect.exists) {
      console.log('schema_migrations does not exist');
    } else {
      console.log('schema_migrations exists with columns:', inspect.columns.join(', '));
      if (inspect.requiresBaseline) console.log('schema_migrations contains legacy rows (checksum NULL) — baseline required');
    }

    // Read files and compute checksums
    const checks = ordered.map(f => {
      const p = path.join(migrationsDir, f);
      const content = fs.readFileSync(p, 'utf8');
      return { file: f, checksum: fileChecksum(content) };
    });

    if (inspect.exists) {
      const applied = await getAppliedMigrationsMap(client);
      const pending = checks.filter(c => !applied.has(c.file));
      const modified = checks.filter(c => applied.has(c.file) && applied.get(c.file) !== c.checksum);

      if (modified.length) {
        throw new Error(`Modified migrations detected: ${modified.map(m => m.file).join(', ')}`);
      }

      if (pending.length === 0) console.log('No pending migrations.');
      else {
        console.log('Pending migrations:');
        for (const p of pending) console.log(` - ${p.file}`);
      }
    } else {
      // No schema_migrations: report all files as candidates but do not create or insert
      console.log('Migrations available (schema_migrations missing):');
      for (const c of checks) console.log(` - ${c.file}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

async function runMigrations() {
  const client = await pool.connect();
  let lockKey = null;
  try {
    // Identify DB safely
    const dbInfo = await client.query('SELECT current_database() AS db, current_user AS user');
    const info = dbInfo.rows[0];
    console.log(`Database: ${info.db}, User: ${info.user}`);

    // Read and order migration files
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    const ordered = parseMigrationFiles(migrationFiles);

    // Inspect before acquiring the lock so a legacy database is never changed implicitly.
    const inspect = await inspectMigrationsTable(client);
    const presentObjects = await detectCoreObjects(client);
    const hasCore = presentObjects.length > 0;

    if (!inspect.exists && hasCore) {
      throw new Error('Existing/legacy database detected. Run migrate:baseline before running migrations.');
    }
    if (inspect.exists && inspect.requiresBaseline) {
      throw new Error('Legacy migration metadata detected. Run migrate:baseline first.');
    }

    // Acquire advisory lock to prevent concurrent runners
    lockKey = await acquireAdvisoryLock(client);

    // A new empty database receives only migration metadata here. Existing databases
    // must be explicitly baselined by an operator before any migration is applied.
    if (!inspect.exists) await ensureMigrationsTable(client);

    const appliedMap = await getAppliedMigrationsMap(client);

    // Determine pending and verify integrity
    const pending = [];
    for (const file of ordered) {
      const p = path.join(migrationsDir, file);
      const content = fs.readFileSync(p, 'utf8');
      const checksum = fileChecksum(content);
      if (appliedMap.has(file)) {
        const known = appliedMap.get(file);
        if (known !== checksum) {
          throw new Error(`Migration ${file} is registered with different checksum. Aborting.`);
        }
      } else {
        pending.push({ file, p, checksum });
      }
    }

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Pending migrations to apply: ${pending.map(p => p.file).join(', ')}`);

    for (const m of pending) {
      const sql = fs.readFileSync(m.p, 'utf8');
      const { enumAdditions, transactionalSql } = splitEnumAdditions(sql);
      try {
        // Enum additions are idempotent (`IF NOT EXISTS`) and must commit before
        // the rest of the migration can reference the new value.
        for (const statement of enumAdditions) await client.query(statement);
        await client.query('BEGIN');
        if (transactionalSql) await client.query(transactionalSql);
        await client.query('INSERT INTO schema_migrations(filename, checksum) VALUES($1, $2)', [m.file, m.checksum]);
        await client.query('COMMIT');
        console.log(`Applied ${m.file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

  } finally {
    try {
      if (lockKey !== null) await releaseAdvisoryLock(client, lockKey);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  if (dryRun) {
    await runDryRun();
    return;
  }
  await runMigrations();
}

main().catch(err => {
  console.error('Migration process failed:', err.message || err);
  process.exit(1);
});
