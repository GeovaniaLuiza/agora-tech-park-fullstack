import crypto from 'node:crypto';
import { pool } from '../db/pool.js';

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export async function issue(userId, requestedIp = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE password_reset_tokens SET used_at=NOW()
      WHERE user_id=$1 AND used_at IS NULL`, [userId]);
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const hours = Number(process.env.PASSWORD_RESET_TOKEN_TTL_HOURS || 1);
    const { rows } = await client.query(`INSERT INTO password_reset_tokens
      (user_id,token_hash,expires_at,requested_ip) VALUES($1,$2,NOW()+($3 * INTERVAL '1 hour'),$4)
      RETURNING id`, [userId, hash(rawToken), hours, requestedIp]);
    await client.query('COMMIT');
    return { tokenId: rows[0].id, rawToken, expiresHours: hours };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function consume(rawToken, passwordHash, audit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT t.id,t.user_id,t.expires_at,t.used_at,u.email_verified_at,u.status
      FROM password_reset_tokens t JOIN users u ON u.id=t.user_id
      WHERE t.token_hash=$1 FOR UPDATE`, [hash(rawToken)]);
    const token = rows[0];
    if (!token) { await client.query('ROLLBACK'); return { state: 'INVALID' }; }
    if (token.used_at) { await client.query('ROLLBACK'); return { state: 'USED' }; }
    if (new Date(token.expires_at) <= new Date()) { await client.query('ROLLBACK'); return { state: 'EXPIRED' }; }
    await client.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1', [token.id]);
    await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [passwordHash, token.user_id]);
    await audit(client, token);
    await client.query('COMMIT');
    return { state: 'RESET' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
