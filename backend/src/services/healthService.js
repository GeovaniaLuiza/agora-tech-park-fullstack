import { databaseHealthCheck } from '../db/pool.js';
import { verifyConnection } from './emailService.js';

const CACHE_TTL_MS = Number(process.env.HEALTH_CACHE_TTL_MS) || 15000;
const CHECK_TIMEOUT_MS = Number(process.env.HEALTH_CHECK_TIMEOUT_MS) || 3000;
let cached;
let cachedAt = 0;

async function withTimeout(check) {
  let timeout;
  try {
    return await Promise.race([
      check(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('health check timeout')), CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function emailHealthCheck() {
  if ((process.env.EMAIL_PROVIDER || 'smtp').toLowerCase() !== 'smtp' || !process.env.SMTP_HOST) {
    return 'down';
  }
  try {
    await withTimeout(verifyConnection);
    return 'up';
  } catch {
    return 'down';
  }
}

export async function getHealth({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  const [database, email] = await Promise.all([
    withTimeout(databaseHealthCheck).catch(() => 'down'),
    emailHealthCheck(),
  ]);
  const status = database !== 'up' ? 'unavailable' : email === 'up' ? 'ok' : 'degraded';
  cached = { status, services: { api: 'up', database, email } };
  cachedAt = Date.now();
  return cached;
}

export function resetHealthCacheForTests() {
  cached = undefined;
  cachedAt = 0;
}
