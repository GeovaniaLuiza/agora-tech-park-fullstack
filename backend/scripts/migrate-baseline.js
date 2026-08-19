import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULTS = {
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 5000,
};

if (!process.env.DATABASE_URL) {
  throw new Error('ERROR: DATABASE_URL is not set in environment. Aborting.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ...DEFAULTS });
// Resolve migrations directory relative to this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../../database/migrations');

function fileChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function askConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function detectCoreObjects(client) {
  const required = [ 'users','organizations','forms','questions','responses','answers','indicators','indicator_definitions','indicator_values','audit_logs','spreadsheet_imports' ];
  const missing = [];
  for (const t of required) {
    const { rows } = await client.query("SELECT to_regclass('public." + t + "') as exists;");
    if (!rows[0] || !rows[0].exists) missing.push(t);
  }
  return missing;
}

async function main() {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes') || args.includes('-y');

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  // select baseline files with numeric prefix <= 11
  const baselineFiles = files.filter(f => {
    const m = f.match(/^(?:0*)(\d+)_/);
    if (!m) return false;
    const n = Number(m[1]);
    return n >= 1 && n <= 11;
  });

  if (baselineFiles.length === 0) {
    console.log('No baseline candidate files (001-011) found in migrations directory. Aborting.');
    return;
  }

  const client = await pool.connect();
  try {
    console.log('Detecting core DB objects...');
    const missing = await detectCoreObjects(client);
    if (missing.length) {
      throw new Error('Missing required objects for safe baseline: ' + missing.join(', '));
    }

    console.log('All core objects present. Baseline candidates:');
    baselineFiles.forEach(f => console.log(' -', f));

    if (!yes) {
      const ans = await askConfirmation('\nConfirm registering these migrations as applied (they will NOT be executed). Type "yes" to proceed: ');
      if (ans.trim().toLowerCase() !== 'yes') {
        console.log('Baseline cancelled by user.');
        return;
      }
    }

    await client.query('BEGIN');
    try {
      await ensureMigrationsTable(client);
      for (const file of baselineFiles) {
        const filePath = path.join(migrationsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const checksum = fileChecksum(content);
        const existing = await client.query(
          'SELECT checksum FROM schema_migrations WHERE filename=$1',
          [file],
        );
        if (existing.rows[0] && existing.rows[0].checksum !== checksum) {
          throw new Error(`Migration ${file} is already registered with a different checksum.`);
        }
        console.log(`Registering ${file} (checksum: ${checksum.slice(0, 8)}...)`);
        await client.query(
          'INSERT INTO schema_migrations(filename, checksum) VALUES($1,$2) ON CONFLICT (filename) DO NOTHING',
          [file, checksum],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    console.log('Baseline registration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Baseline process failed:', err.message || err);
  process.exit(1);
});
