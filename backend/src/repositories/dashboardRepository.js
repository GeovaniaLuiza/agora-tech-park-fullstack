import { query } from '../db/pool.js';

export async function operationalSummary() {
  const { rows } = await query(
    `WITH active_organizations AS (
       SELECT COUNT(*)::int AS total FROM organizations WHERE status='ACTIVE'
     ), active_forms AS (
       SELECT id FROM forms WHERE status='ACTIVE'
         AND (start_date IS NULL OR start_date<=NOW()) AND (end_date IS NULL OR end_date>=NOW())
     ), expected AS (
       SELECT COALESCE(SUM(CASE WHEN targets.total=0 THEN organizations.total ELSE targets.total END),0)::int AS total
       FROM active_forms f CROSS JOIN active_organizations organizations
       CROSS JOIN LATERAL (SELECT COUNT(*)::int AS total FROM form_organizations fo WHERE fo.form_id=f.id) targets
     ), received AS (
       SELECT COUNT(*)::int AS total FROM responses r JOIN active_forms f ON f.id=r.form_id WHERE r.status='SUBMITTED'
     )
     SELECT
       (SELECT total FROM active_organizations) AS active_organizations,
       (SELECT COUNT(*)::int FROM active_forms) AS active_forms,
       (SELECT COUNT(*)::int FROM forms WHERE status='DRAFT') AS pending_forms,
       (SELECT total FROM expected) AS expected_responses,
       (SELECT total FROM received) AS submitted_responses,
       CASE WHEN (SELECT total FROM expected)=0 THEN 0
         ELSE ROUND(100.0*(SELECT total FROM received)/(SELECT total FROM expected)) END AS response_rate,
       (SELECT COUNT(*)::int FROM indicator_definitions WHERE active) AS monitored_indicators,
       (SELECT COUNT(*)::int FROM active_forms) AS ongoing_collections,
       NOW() AS updated_at`,
  );
  return rows[0];
}

export async function institutionalCards({ year, month = null, category = null, sourceType, centerId = null }) {
  const { rows } = await query(
    `SELECT d.code,d.name AS title,d.description,d.category,d.unit,d.value_type,d.aggregation_type,
      v.numeric_value,v.text_value,v.json_value,v.year,v.month,v.source_type,
      v.consolidated_at,v.updated_at,
      previous.numeric_value AS previous_numeric_value,previous.text_value AS previous_text_value
     FROM indicator_definitions d
     JOIN LATERAL (SELECT candidate.* FROM indicator_values candidate WHERE candidate.indicator_id=d.id
       AND candidate.year=$1 AND (($2::int IS NULL AND candidate.month IS NULL) OR candidate.month=$2)
       AND candidate.deleted_at IS NULL
       AND candidate.innovation_center_id=COALESCE($5::uuid,(SELECT id FROM innovation_centers WHERE active ORDER BY name LIMIT 1))
       AND (($4='LIVE' AND candidate.source_type IN ('FORM_RESPONSE','MANUAL_ENTRY','SYSTEM_CALCULATION','SPREADSHEET_IMPORT')) OR candidate.source_type=$4)
       ORDER BY CASE candidate.source_type WHEN 'FORM_RESPONSE' THEN 1 WHEN 'SYSTEM_CALCULATION' THEN 2 WHEN 'MANUAL_ENTRY' THEN 3 ELSE 4 END,
         candidate.updated_at DESC LIMIT 1) v ON TRUE
     LEFT JOIN LATERAL (SELECT candidate.* FROM indicator_values candidate WHERE candidate.indicator_id=d.id
       AND candidate.year=$1-1 AND candidate.month IS NOT DISTINCT FROM v.month AND candidate.deleted_at IS NULL
       AND candidate.innovation_center_id=v.innovation_center_id
       AND (($4='LIVE' AND candidate.source_type IN ('FORM_RESPONSE','MANUAL_ENTRY','SYSTEM_CALCULATION','SPREADSHEET_IMPORT')) OR candidate.source_type=$4)
       ORDER BY CASE candidate.source_type WHEN 'FORM_RESPONSE' THEN 1 WHEN 'SYSTEM_CALCULATION' THEN 2 WHEN 'MANUAL_ENTRY' THEN 3 ELSE 4 END,
         candidate.updated_at DESC LIMIT 1) previous ON TRUE
     WHERE d.active AND ($3::text IS NULL OR d.category=$3)
     ORDER BY d.category,d.name`,
    [year, month, category, sourceType, centerId],
  );
  return rows;
}

export async function series(codes, { year, month = null, category = null, sourceType, startDate = null, endDate = null, centerId = null }) {
  const { rows } = await query(
    `WITH ranked_values AS (
       SELECT candidate.*,ROW_NUMBER() OVER (
         PARTITION BY candidate.indicator_id,candidate.innovation_center_id,candidate.year,candidate.month
         ORDER BY CASE candidate.source_type WHEN 'FORM_RESPONSE' THEN 1 WHEN 'SYSTEM_CALCULATION' THEN 2 WHEN 'MANUAL_ENTRY' THEN 3 ELSE 4 END,candidate.updated_at DESC
       ) AS source_rank
       FROM indicator_values candidate WHERE candidate.deleted_at IS NULL
         AND (($3='LIVE' AND candidate.source_type IN ('FORM_RESPONSE','MANUAL_ENTRY','SYSTEM_CALCULATION','SPREADSHEET_IMPORT')) OR candidate.source_type=$3)
     )
     SELECT d.code,d.name,d.unit,d.value_type,d.category,v.month,v.numeric_value,
       v.period_start,v.period_end,v.source_type,v.consolidated_at
     FROM indicator_definitions d JOIN ranked_values v ON v.indicator_id=d.id
     WHERE d.code=ANY($1::text[]) AND d.active AND v.year=$2 AND v.month IS NOT NULL AND v.source_rank=1
       AND v.innovation_center_id=COALESCE($8::uuid,(SELECT id FROM innovation_centers WHERE active ORDER BY name LIMIT 1))
       AND ($4::text IS NULL OR d.category=$4)
       AND ($5::date IS NULL OR v.period_end >= $5::date)
       AND ($6::date IS NULL OR v.period_start <= $6::date)
       AND ($7::int IS NULL OR v.month=$7)
     ORDER BY d.code,v.month`,
    [codes, year, sourceType, category, startDate, endDate, month, centerId],
  );
  return rows;
}

export async function categories() {
  const { rows } = await query('SELECT DISTINCT category FROM indicator_definitions WHERE active ORDER BY category');
  return rows.map((row) => row.category);
}

export async function latestImport(year) {
  const { rows } = await query(
    `SELECT id,file_name,sheet_name,year,file_hash,imported_at,summary,errors
     FROM spreadsheet_imports WHERE year=$1 AND status='IMPORTED' ORDER BY imported_at DESC LIMIT 1`,
    [year],
  );
  return rows[0] || null;
}
