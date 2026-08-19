import { query } from '../db/pool.js';

export async function summary({ period = null, name = null, category = null, sourceType = 'LIVE', centerId = null } = {}) {
  const year = /^\d{4}/.test(period || '') ? Number(String(period).slice(0, 4)) : new Date().getFullYear();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(period || '') ? Number(String(period).slice(5, 7)) : null;
  const { rows } = await query(
    `WITH ranked AS (
       SELECT v.*,ROW_NUMBER() OVER (PARTITION BY v.indicator_id,COALESCE(v.month,0)
         ORDER BY CASE v.source_type WHEN 'FORM_RESPONSE' THEN 1 WHEN 'SYSTEM_CALCULATION' THEN 2 WHEN 'MANUAL_ENTRY' THEN 3 ELSE 4 END,v.updated_at DESC) AS rn
       FROM indicator_values v WHERE v.year=$1 AND v.deleted_at IS NULL
         AND v.innovation_center_id=COALESCE($6::uuid,(SELECT id FROM innovation_centers WHERE active ORDER BY name LIMIT 1))
         AND (($5='LIVE' AND v.source_type IN ('FORM_RESPONSE','SYSTEM_CALCULATION','MANUAL_ENTRY','SPREADSHEET_IMPORT')) OR v.source_type=$5)
         AND ($2::int IS NULL OR v.month=$2)
     ), selected AS (SELECT * FROM ranked WHERE rn=1)
     SELECT (array_agg(v.id ORDER BY v.month DESC NULLS LAST))[1] AS id,d.code,d.name,d.description,d.category,d.unit,d.value_type,
       CASE WHEN $2::int IS NOT NULL THEN MAX(v.numeric_value)
         WHEN COALESCE(d.annual_aggregation,d.aggregation_type)='AVERAGE' THEN AVG(v.numeric_value)
         WHEN COALESCE(d.annual_aggregation,d.aggregation_type)='LAST_VALUE' THEN (array_agg(v.numeric_value ORDER BY v.month DESC NULLS LAST) FILTER (WHERE v.numeric_value IS NOT NULL))[1]
         ELSE SUM(v.numeric_value) END AS value,
       (array_agg(v.text_value ORDER BY v.month DESC NULLS LAST) FILTER (WHERE v.text_value IS NOT NULL))[1] AS text_value,
       (array_agg(v.json_value ORDER BY v.month DESC NULLS LAST) FILTER (WHERE v.json_value IS NOT NULL))[1] AS json_value,
       $1::int AS year,$2::int AS month,CASE WHEN $2::int IS NULL THEN $1::text ELSE $1::text || '-' || LPAD($2::text,2,'0') END AS period,
       CASE WHEN BOOL_OR(v.source_type='FORM_RESPONSE') THEN 'FORM_RESPONSE' ELSE (array_agg(v.source_type ORDER BY v.month DESC NULLS LAST))[1] END AS source,
       MAX(v.consolidated_at) AS updated_at
     FROM selected v JOIN indicator_definitions d ON d.id=v.indicator_id
     WHERE d.active
       AND ($2::int IS NOT NULL OR v.month IS NOT NULL OR NOT EXISTS (
         SELECT 1 FROM selected monthly WHERE monthly.indicator_id=v.indicator_id AND monthly.month IS NOT NULL
       ))
       AND ($3::text IS NULL OR d.name ILIKE '%' || $3 || '%' OR d.code ILIKE '%' || $3 || '%')
       AND ($4::text IS NULL OR d.category=$4)
     GROUP BY d.id,d.code,d.name,d.description,d.category,d.unit,d.value_type,d.annual_aggregation,d.aggregation_type
     ORDER BY d.category,d.name`,
    [year, month, name, category, sourceType, centerId],
  );
  return rows;
}

export async function periods() {
  const { rows } = await query('SELECT DISTINCT year FROM indicator_values WHERE deleted_at IS NULL ORDER BY year DESC');
  return rows.map((row) => String(row.year));
}

export async function dashboard() {
  const { rows } = await query(
    `SELECT
      (SELECT COUNT(*)::int FROM organizations WHERE status='ACTIVE') AS active_organizations,
      (SELECT COUNT(*)::int FROM forms WHERE status='ACTIVE') AS active_forms,
      (SELECT COUNT(*)::int FROM responses WHERE status='SUBMITTED') AS submitted_responses,
      (SELECT COUNT(*)::int FROM indicator_definitions WHERE active) AS indicators,
      CASE WHEN (SELECT COUNT(*) FROM forms WHERE status='ACTIVE')=0 THEN 0
        ELSE ROUND(100.0 * (SELECT COUNT(*) FROM responses WHERE status='SUBMITTED')
          / GREATEST(1,(SELECT COUNT(*) FROM forms WHERE status='ACTIVE')
            * (SELECT COUNT(*) FROM organizations WHERE status='ACTIVE'))) END AS response_rate`,
  );
  return rows[0];
}

export async function recompute(period) {
  return query(
    `INSERT INTO indicators(name,value,period,source)
     SELECT 'Respostas enviadas',COUNT(*)::numeric,$1,'FAPESC_SCTI' FROM responses WHERE status='SUBMITTED'
     ON CONFLICT(name,period) DO UPDATE SET value=EXCLUDED.value,source='FAPESC_SCTI',updated_at=NOW()`,
    [period],
  );
}
