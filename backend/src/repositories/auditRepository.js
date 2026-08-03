import { query } from '../db/pool.js';

export async function record({ userId = null, action, entity = 'user', entityId = null, details = {}, ipAddress = null }, client = { query }) {
  await client.query(`INSERT INTO audit_logs(user_id,action,entity,entity_id,details,ip_address)
    VALUES($1,$2,$3,$4,$5::jsonb,$6)`, [userId, action, entity, entityId, JSON.stringify(details), ipAddress]);
}

export async function list({ action = null, entity = null, limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const { rows } = await query(
    `SELECT a.id,a.user_id,u.name AS user_name,a.action,a.entity,a.entity_id,
      a.details,a.ip_address,a.created_at
     FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
     WHERE ($1::text IS NULL OR a.action=$1)
       AND ($2::text IS NULL OR a.entity=$2)
     ORDER BY a.created_at DESC LIMIT $3`,
    [action, entity, safeLimit],
  );
  return rows;
}
