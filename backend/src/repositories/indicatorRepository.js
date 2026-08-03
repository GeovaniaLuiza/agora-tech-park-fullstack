import { query } from '../db/pool.js';

export async function summary({ period = null, name = null } = {}) {
  const { rows } = await query(
    `SELECT id,name,value,period,created_at,updated_at FROM indicators
     WHERE ($1::text IS NULL OR period=$1)
       AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
     ORDER BY period DESC,name`,
    [period, name],
  );
  return rows;
}

export async function periods() {
  const { rows } = await query('SELECT DISTINCT period FROM indicators ORDER BY period DESC');
  return rows.map((row) => row.period);
}

export async function dashboard() {
  const { rows } = await query(
    `SELECT
      (SELECT COUNT(*)::int FROM organizations WHERE status='ACTIVE') AS active_organizations,
      (SELECT COUNT(*)::int FROM forms WHERE status='ACTIVE') AS active_forms,
      (SELECT COUNT(*)::int FROM responses WHERE status='SUBMITTED') AS submitted_responses,
      (SELECT COUNT(*)::int FROM indicators) AS indicators,
      CASE WHEN (SELECT COUNT(*) FROM forms WHERE status='ACTIVE')=0 THEN 0
        ELSE ROUND(100.0 * (SELECT COUNT(*) FROM responses WHERE status='SUBMITTED')
          / GREATEST(1,(SELECT COUNT(*) FROM forms WHERE status='ACTIVE')
            * (SELECT COUNT(*) FROM organizations WHERE status='ACTIVE'))) END AS response_rate`,
  );
  return rows[0];
}

export async function recompute(period) {
  return query(
    `INSERT INTO indicators(name,value,period)
     SELECT 'Respostas enviadas',COUNT(*)::numeric,$1 FROM responses WHERE status='SUBMITTED'
     ON CONFLICT(name,period) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,
    [period],
  );
}
