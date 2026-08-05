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

export async function institutionalCards({ year, month = null, category = null, sourceType }) {
  const { rows } = await query(
    `SELECT d.code,d.name AS title,d.description,d.category,d.unit,d.value_type,d.aggregation_type,
      v.numeric_value,v.text_value,v.json_value,v.year,v.month,v.source_type,
      v.consolidated_at,v.updated_at,
      previous.numeric_value AS previous_numeric_value,previous.text_value AS previous_text_value
     FROM indicator_definitions d
     JOIN indicator_values v ON v.indicator_id=d.id
       AND v.year=$1 AND (($2::int IS NULL AND v.month IS NULL) OR v.month=$2)
       AND v.source_type=$4
     LEFT JOIN indicator_values previous ON previous.indicator_id=d.id
       AND previous.year=$1-1 AND previous.month IS NOT DISTINCT FROM v.month
       AND previous.source_type=v.source_type
     WHERE d.active AND ($3::text IS NULL OR d.category=$3)
     ORDER BY d.category,d.name`,
    [year, month, category, sourceType],
  );
  return rows;
}

export async function series(codes, { year, month = null, category = null, sourceType, startDate = null, endDate = null }) {
  const { rows } = await query(
    `SELECT d.code,d.name,d.unit,d.value_type,d.category,v.month,v.numeric_value,
       v.period_start,v.period_end,v.source_type,v.consolidated_at
     FROM indicator_definitions d JOIN indicator_values v ON v.indicator_id=d.id
     WHERE d.code=ANY($1::text[]) AND d.active AND v.year=$2 AND v.month IS NOT NULL
       AND v.source_type=$3 AND ($4::text IS NULL OR d.category=$4)
       AND ($5::date IS NULL OR v.period_end >= $5::date)
       AND ($6::date IS NULL OR v.period_start <= $6::date)
       AND ($7::int IS NULL OR v.month=$7)
     ORDER BY d.code,v.month`,
    [codes, year, sourceType, category, startDate, endDate, month],
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
