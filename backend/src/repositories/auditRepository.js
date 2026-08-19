import { query } from '../db/pool.js';

export async function record({ userId = null, action, entity = 'user', entityId = null, details = {}, ipAddress = null }, client = { query }) {
  await client.query(`INSERT INTO audit_logs(user_id,action,entity,entity_id,details,ip_address)
    VALUES($1,$2,$3,$4,$5::jsonb,$6)`, [userId, action, entity, entityId, JSON.stringify(details), ipAddress]);
}

export async function list({ action = null, entity = null, limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const { rows } = await query(
    `SELECT a.id,a.user_id,u.name AS user_name,u.email AS user_email,a.action,a.entity,
      CASE WHEN a.entity='form' OR a.action IN ('USER_ACTIVATED','USER_INACTIVATED','ROLE_CHANGED','USER_DELETED','INDICATOR_DEFINITION_CREATED','INDICATOR_DEFINITION_UPDATED','INDICATOR_DEFINITION_DEACTIVATED') THEN NULL ELSE a.entity_id END AS entity_id,
      f.title AS entity_name,a.details,a.ip_address,a.created_at
     FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
     LEFT JOIN forms f ON a.entity='form' AND f.id=a.entity_id
     WHERE ($1::text IS NULL OR a.action=$1)
       AND ($2::text IS NULL OR a.entity=$2)
     ORDER BY a.created_at DESC LIMIT $3`,
    [action, entity, safeLimit],
  );
  return rows;
}

export async function clear() {
  const { rowCount } = await query('DELETE FROM audit_logs');
  return rowCount;
}
