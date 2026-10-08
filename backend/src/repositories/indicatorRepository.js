import { query } from '../db/pool.js';

export async function summary({ period = null, year: requestedYear = null, name = null, category = null, sourceType = 'LIVE', centerId = null, officialDashboard = false, codes = null } = {}, client = { query }) {
  const official = (officialDashboard === true || officialDashboard === 'true') && sourceType === 'SPREADSHEET_IMPORT';
  const year = requestedYear ? Number(requestedYear) : /^\d{4}/.test(period || '') ? Number(String(period).slice(0, 4)) : new Date().getFullYear();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(period || '') ? Number(String(period).slice(5, 7)) : null;
  const { rows } = await client.query(
    `WITH ranked AS (
       SELECT v.*,ROW_NUMBER() OVER (PARTITION BY v.indicator_id,COALESCE(v.month,0)
         ORDER BY CASE v.source_type WHEN 'FORM_RESPONSE' THEN 1 WHEN 'SYSTEM_CALCULATION' THEN 2 WHEN 'MANUAL_ENTRY' THEN 3 ELSE 4 END,v.updated_at DESC) AS rn
       FROM indicator_values v WHERE v.year=$1 AND v.deleted_at IS NULL
         AND v.innovation_center_id=COALESCE($6::uuid,(SELECT id FROM innovation_centers WHERE active ORDER BY name LIMIT 1))
         AND (($5='LIVE' AND v.source_type IN ('FORM_RESPONSE','SYSTEM_CALCULATION','MANUAL_ENTRY','SPREADSHEET_IMPORT')) OR v.source_type=$5)
         AND ($2::int IS NULL OR v.month=$2)
     ), selected AS (SELECT * FROM ranked WHERE rn=1), effective AS (
       SELECT v.* FROM selected v JOIN indicator_definitions definition ON definition.id=v.indicator_id
       WHERE $2::int IS NOT NULL OR CASE
         WHEN $7::boolean AND EXISTS (SELECT 1 FROM selected annual WHERE annual.indicator_id=v.indicator_id
           AND annual.month IS NULL AND (annual.numeric_value IS NOT NULL OR annual.text_value IS NOT NULL OR annual.json_value IS NOT NULL)) THEN v.month IS NULL
         WHEN COALESCE(definition.annual_aggregation,definition.aggregation_type) IN ('DERIVED','CALCULATED') THEN v.month IS NULL
         ELSE v.month IS NOT NULL OR NOT EXISTS (
           SELECT 1 FROM selected monthly WHERE monthly.indicator_id=v.indicator_id AND monthly.month IS NOT NULL
         ) END
     )
     SELECT d.id,d.code,d.name,d.description,d.category,d.unit,d.value_type,d.periodicity,d.annual_aggregation,d.aggregation_type,
       CASE WHEN $7::boolean AND $2::int IS NULL AND COUNT(v.month)=0 AND COUNT(v.id)>0 THEN 'RECORDED_ANNUAL'
         ELSE COALESCE(d.annual_aggregation,d.aggregation_type) END AS consolidation_basis,
       CASE WHEN $2::int IS NOT NULL THEN MAX(v.numeric_value)
         WHEN COUNT(v.month)=0 THEN MAX(v.numeric_value)
         WHEN COALESCE(d.annual_aggregation,d.aggregation_type)='AVERAGE' THEN AVG(v.numeric_value)
         WHEN COALESCE(d.annual_aggregation,d.aggregation_type)='LAST_VALUE' THEN (array_agg(v.numeric_value ORDER BY v.month DESC NULLS LAST) FILTER (WHERE v.numeric_value IS NOT NULL))[1]
         WHEN COALESCE(d.annual_aggregation,d.aggregation_type) IN ('SUM','COUNT') THEN SUM(v.numeric_value)
         ELSE NULL END AS value,
       (array_agg(v.text_value ORDER BY v.month DESC NULLS LAST) FILTER (WHERE v.text_value IS NOT NULL))[1] AS text_value,
       (array_agg(v.json_value ORDER BY v.month DESC NULLS LAST) FILTER (WHERE v.json_value IS NOT NULL))[1] AS json_value,
       $1::int AS year,$2::int AS month,CASE WHEN $2::int IS NULL THEN $1::text ELSE $1::text || '-' || LPAD($2::text,2,'0') END AS period,
       CASE WHEN BOOL_OR(v.source_type='FORM_RESPONSE') THEN 'FORM_RESPONSE' ELSE (array_agg(v.source_type ORDER BY v.month DESC NULLS LAST))[1] END AS source,
       COALESCE(array_agg(DISTINCT v.source_type) FILTER (WHERE v.id IS NOT NULL),ARRAY[]::varchar[]) AS sources,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('month',monthly.month,'value',monthly.numeric_value,
         'text_value',monthly.text_value,'json_value',monthly.json_value,'source',monthly.source_type,
         'updated_at',GREATEST(monthly.updated_at,monthly.consolidated_at)) ORDER BY monthly.month)
         FROM selected monthly WHERE monthly.indicator_id=d.id AND monthly.month IS NOT NULL),'[]'::jsonb) AS monthly_values,
       MAX(GREATEST(v.updated_at,v.consolidated_at)) AS updated_at
     FROM indicator_definitions d LEFT JOIN effective v ON d.id=v.indicator_id
     WHERE d.active
       AND ($7::boolean OR $5='LIVE' OR EXISTS (SELECT 1 FROM selected matching WHERE matching.indicator_id=d.id))
       AND ($3::text IS NULL OR d.name ILIKE '%' || $3 || '%' OR d.code ILIKE '%' || $3 || '%')
       AND ($4::text IS NULL OR d.category=$4)
       AND ($8::text[] IS NULL OR d.code=ANY($8::text[]))
     GROUP BY d.id,d.code,d.name,d.description,d.category,d.unit,d.value_type,d.periodicity,d.annual_aggregation,d.aggregation_type,d.sort_order
     ORDER BY d.category,d.sort_order,d.name`,
    [year, month, name, category, sourceType, centerId, official, official && typeof codes === 'string' ? codes.split(',').filter(Boolean) : null],
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
