import pg from 'pg';
import { logger } from '../observability/logger.js';

const { Pool } = pg;

const DEFAULTS = {
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 5000,
};

if (!process.env.DATABASE_URL) {
  logger.warn({ event: 'database_configuration_missing' }, 'DATABASE_URL is not configured');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ...DEFAULTS });

pool.on('error', (err) => {
  logger.error({ event: 'database_pool_error', err }, 'Unexpected PostgreSQL pool error');
});

const query = (text, params) => pool.query(text, params);

async function databaseHealthCheck() {
  try {
    await pool.query('SELECT 1');
    return 'up';
  } catch {
    return 'down';
  }
}

async function shutdown() {
  try {
    await pool.end();
  } catch (err) {
    logger.error({ event: 'database_shutdown_error', err }, 'Failed to close PostgreSQL pool');
  }
}

export { pool, query, databaseHealthCheck, shutdown };
