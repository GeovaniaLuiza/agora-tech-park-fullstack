import crypto from 'node:crypto';
import { pool, query } from '../db/pool.js';
import { EMAIL_VERIFICATION_PURPOSE } from '../domain/accessControl.js';

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const PENDING_DELIVERY_GRACE_MS = 30_000;

export async function issue(userId, client = { query }, options = {}) {
  const { minimumMinutes = 0, maxPerHour = 0, requestedIp = null } = options;
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
  const latest = await client.query(`SELECT created_at FROM email_verification_tokens
    WHERE user_id=$1 AND purpose=$2 ORDER BY created_at DESC LIMIT 1`, [userId, EMAIL_VERIFICATION_PURPOSE]);
  if (latest.rows[0] && Date.now() - new Date(latest.rows[0].created_at).getTime() < minimumMinutes * 60_000) {
    const elapsed = Date.now() - new Date(latest.rows[0].created_at).getTime();
    return { tooSoon: true, retryAfterSeconds: Math.max(1, Math.ceil((minimumMinutes * 60_000 - elapsed) / 1000)) };
  }
  if (maxPerHour > 0) {
    const recent = await client.query(`SELECT COUNT(*)::int AS count,MIN(created_at) AS oldest_created_at FROM email_verification_tokens
      WHERE user_id=$1 AND purpose=$2 AND created_at >= NOW() - INTERVAL '1 hour'`, [userId, EMAIL_VERIFICATION_PURPOSE]);
    if (recent.rows[0].count >= maxPerHour) {
      const oldest = new Date(recent.rows[0].oldest_created_at).getTime();
      return { rateLimited: true, retryAfterSeconds: Math.max(1, Math.ceil((oldest + 60 * 60_000 - Date.now()) / 1000)) };
    }
  }
  const pending = await client.query(`SELECT id,created_at FROM email_verification_tokens
    WHERE user_id=$1 AND purpose=$2 AND delivery_status='PENDING' AND used_at IS NULL LIMIT 1`,
  [userId, EMAIL_VERIFICATION_PURPOSE]);
  if (pending.rows[0]) {
    const pendingToken = pending.rows[0];
    const age = Date.now() - new Date(pendingToken.created_at).getTime();
    if (age < PENDING_DELIVERY_GRACE_MS) {
      return { inProgress: true, retryAfterSeconds: Math.max(1, Math.ceil((PENDING_DELIVERY_GRACE_MS - age) / 1000)) };
    }
    await client.query(`UPDATE email_verification_tokens
      SET delivery_status='FAILED',used_at=COALESCE(used_at,NOW())
      WHERE id=$1 AND delivery_status='PENDING' AND used_at IS NULL`, [pendingToken.id]);
  }
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hash(rawToken);
  const hours = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS || process.env.EMAIL_VERIFICATION_TTL_HOURS || 24);
  const inserted = await client.query(`INSERT INTO email_verification_tokens
    (user_id,token_hash,purpose,expires_at,requested_ip,delivery_status)
    VALUES($1,$2,$3,NOW()+($4 * INTERVAL '1 hour'),$5,'PENDING') RETURNING id`,
  [userId, tokenHash, EMAIL_VERIFICATION_PURPOSE, hours, requestedIp]);
  return { tokenId: inserted.rows[0].id, rawToken, expiresHours: hours };
}

export async function markDelivered(tokenId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT id,user_id,purpose,delivery_status FROM email_verification_tokens
      WHERE id=$1 FOR UPDATE`, [tokenId]);
    const token = rows[0];
    if (!token || token.delivery_status !== 'PENDING') {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(`UPDATE email_verification_tokens SET used_at=COALESCE(used_at,NOW())
      WHERE user_id=$1 AND purpose=$2 AND id<>$3 AND used_at IS NULL AND delivery_status='DELIVERED'`,
    [token.user_id, token.purpose, token.id]);
    await client.query(`UPDATE email_verification_tokens SET delivery_status='DELIVERED' WHERE id=$1`, [token.id]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function markDeliveryFailed(tokenId) {
  const { rowCount } = await query(`UPDATE email_verification_tokens
    SET delivery_status='FAILED',used_at=COALESCE(used_at,NOW())
    WHERE id=$1 AND delivery_status='PENDING'`, [tokenId]);
  return rowCount > 0;
}

export async function verify(rawToken, audit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT t.id,t.user_id,t.purpose,t.expires_at,t.used_at,u.name,u.email,u.status
      FROM email_verification_tokens t JOIN users u ON u.id=t.user_id
      WHERE t.token_hash=$1 AND t.delivery_status='DELIVERED' FOR UPDATE`, [hash(rawToken)]);
    const token = result.rows[0];
    if (!token) { await client.query('ROLLBACK'); return { state: 'INVALID' }; }
    if (token.purpose !== EMAIL_VERIFICATION_PURPOSE) { await client.query('ROLLBACK'); return { state: 'INVALID' }; }
    if (token.used_at) { await client.query('ROLLBACK'); return { state: 'USED' }; }
    if (new Date(token.expires_at) <= new Date()) { await client.query('ROLLBACK'); return { state: 'EXPIRED' }; }
    if (token.status !== 'EMAIL_PENDING') { await client.query('ROLLBACK'); return { state: 'USED' }; }
    await client.query('UPDATE email_verification_tokens SET used_at=NOW() WHERE id=$1', [token.id]);
    await client.query(`UPDATE users SET email_verified_at=NOW(),status='PENDING' WHERE id=$1`, [token.user_id]);
    await audit(client, token);
    await client.query('COMMIT');
    return { state: 'VERIFIED', user: { id: token.user_id, name: token.name, email: token.email } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export const issueForExistingUser = async (userId, options) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const issued = await issue(userId, client, options);
    if (issued.tooSoon || issued.rateLimited || issued.inProgress) { await client.query('ROLLBACK'); return issued; }
    await client.query('COMMIT');
    return issued;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};
