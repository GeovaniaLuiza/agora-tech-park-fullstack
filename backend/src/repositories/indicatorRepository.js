import { query } from '../db/pool.js';

export async function summary({ period = null, name = null, category = null, sourceType = 'SPREADSHEET_IMPORT' } = {}) {
  const year = /^\d{4}/.test(period || '') ? Number(String(period).slice(0, 4)) : 2025;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(period || '') ? Number(String(period).slice(5, 7)) : null;
  const { rows } = await query(
    `SELECT v.id,d.code,d.name,d.description,d.category,d.unit,d.value_type,
       v.numeric_value AS value,v.text_value,v.json_value,v.year,v.month,
       CASE WHEN v.month IS NULL THEN v.year::text
         ELSE v.year::text || '-' || LPAD(v.month::text,2,'0') END AS period,
       v.source_type AS source,v.consolidated_at AS updated_at
     FROM indicator_values v JOIN indicator_definitions d ON d.id=v.indicator_id
     WHERE d.active AND v.year=$1
       AND (($2::int IS NULL AND v.month IS NULL) OR v.month=$2)
       AND v.source_type=$5
       AND ($3::text IS NULL OR d.name ILIKE '%' || $3 || '%' OR d.code ILIKE '%' || $3 || '%')
       AND ($4::text IS NULL OR d.category=$4)
     ORDER BY d.category,d.name`,
    [year, month, name, category, sourceType],
  );
  return rows;
}

export async function periods() {
  const { rows } = await query("SELECT DISTINCT year FROM indicator_values WHERE source_type='SPREADSHEET_IMPORT' ORDER BY year DESC");
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
