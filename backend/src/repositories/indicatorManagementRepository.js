import { pool, query } from '../db/pool.js';

const valueProjection = `SELECT v.id,v.indicator_id,v.innovation_center_id,v.year,v.month,v.numeric_value,
  v.text_value,v.json_value,v.notes,v.source_type,v.created_at,v.updated_at,
  creator.name AS created_by_name,updater.name AS updated_by_name,
  d.code,d.name,d.category,d.unit,d.value_type,d.calculation_type,d.annual_aggregation
  FROM indicator_values v JOIN indicator_definitions d ON d.id=v.indicator_id
  LEFT JOIN users creator ON creator.id=v.created_by LEFT JOIN users updater ON updater.id=v.updated_by`;

export async function listCenters({ includeInactive = false } = {}) {
  const { rows } = await query(
    `SELECT id,code,name,municipality,state,phase,facilities_status,innovation_law_status,miditec_status,active,created_at,updated_at
     FROM innovation_centers WHERE ($1::boolean OR active) ORDER BY name`,
    [includeInactive],
  );
  return rows;
}

export async function findCenter(id) {
  const { rows } = await query('SELECT * FROM innovation_centers WHERE id=$1', [id]);
  return rows[0];
}

export async function createCenter(data, userId) {
  const { rows } = await query(
    `INSERT INTO innovation_centers(code,name,municipality,state,phase,facilities_status,innovation_law_status,miditec_status,created_by,updated_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
    [data.code, data.name, data.municipality, data.state, data.phase, data.facilitiesStatus, data.innovationLawStatus, data.miditecStatus, userId],
  );
  return rows[0];
}

export async function updateCenter(id, data, userId) {
  const { rows } = await query(
    `UPDATE innovation_centers SET name=COALESCE($2,name),municipality=COALESCE($3,municipality),state=COALESCE($4,state),
       phase=COALESCE($5,phase),facilities_status=COALESCE($6,facilities_status),
       innovation_law_status=COALESCE($7,innovation_law_status),miditec_status=COALESCE($8,miditec_status),
       active=COALESCE($9,active),updated_by=$10 WHERE id=$1 RETURNING *`,
    [id, data.name, data.municipality, data.state, data.phase, data.facilitiesStatus, data.innovationLawStatus, data.miditecStatus, data.active, userId],
  );
  return rows[0];
}

export async function listDefinitions(centerId) {
  const { rows } = await query(
    `SELECT d.id,d.code,d.name,d.description,d.category,d.unit,d.value_type,d.periodicity,
       d.calculation_type,d.annual_aggregation,d.sort_order,d.source_entity,d.formula,
       d.not_applicable_allowed,d.active,COALESCE(a.applicable,TRUE) AS applicable,a.notes AS applicability_notes
     FROM indicator_definitions d
     LEFT JOIN indicator_applicability a ON a.indicator_id=d.id AND a.innovation_center_id=$1
     WHERE d.active ORDER BY d.category,d.sort_order,d.name`,
    [centerId],
  );
  return rows;
}

export async function findDefinition(idOrCode) {
  const { rows } = await query(
    `SELECT * FROM indicator_definitions WHERE id::text=$1 OR code=$1 LIMIT 1`,
    [idOrCode],
  );
  return rows[0];
}

export async function listCatalogDefinitions(includeInactive = false) {
  const { rows } = await query(
    `SELECT id,code,name,description,category,unit,value_type,periodicity,aggregation_type,
      default_source_type,calculation_type,annual_aggregation,sort_order,active,created_at,updated_at
     FROM indicator_definitions WHERE ($1::boolean OR active)
     ORDER BY category,sort_order,name`,
    [includeInactive],
  );
  return rows;
}

export async function createDefinition(data) {
  const { rows } = await query(
    `INSERT INTO indicator_definitions(code,name,description,category,unit,value_type,periodicity,
      aggregation_type,annual_aggregation,default_source_type,calculation_type,sort_order,active)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'FORM_RESPONSE','MANUAL',$10,TRUE)
     RETURNING *`,
    [data.code, data.name, data.description, data.category, data.unit, data.valueType,
      data.periodicity, data.aggregationType, data.annualAggregation, data.sortOrder],
  );
  return rows[0];
}

export async function updateDefinition(id, data) {
  const { rows } = await query(
    `UPDATE indicator_definitions SET name=$2,description=$3,category=$4,unit=$5,value_type=$6,
      periodicity=$7,aggregation_type=$8,annual_aggregation=$9,sort_order=$10,active=$11
     WHERE id=$1 RETURNING *`,
    [id, data.name, data.description, data.category, data.unit, data.valueType,
      data.periodicity, data.aggregationType, data.annualAggregation, data.sortOrder, data.active],
  );
  return rows[0];
}

export async function definitionFormLinks(id) {
  const { rows } = await query(
    `SELECT COUNT(1)::int AS total FROM question_indicator_links qil
     JOIN questions q ON q.id=qil.question_id JOIN forms f ON f.id=q.form_id
     WHERE qil.indicator_id=$1 AND qil.active AND f.status IN ('DRAFT','ACTIVE')`,
    [id],
  );
  return rows[0].total;
}

export async function deactivateDefinition(id) {
  const { rows } = await query(
    `UPDATE indicator_definitions SET active=FALSE WHERE id=$1 AND active RETURNING *`, [id],
  );
  return rows[0];
}

export async function setApplicability(centerId, indicatorId, applicable, notes, userId) {
  const { rows } = await query(
    `INSERT INTO indicator_applicability(innovation_center_id,indicator_id,applicable,notes,updated_by)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(innovation_center_id,indicator_id) DO UPDATE
       SET applicable=EXCLUDED.applicable,notes=EXCLUDED.notes,updated_by=EXCLUDED.updated_by,updated_at=NOW()
     RETURNING *`,
    [centerId, indicatorId, applicable, notes || null, userId],
  );
  return rows[0];
}

export async function listValues({ centerId, year, month = null, indicatorId = null, includeAnnual = false }) {
  const { rows } = await query(
    `${valueProjection}
     WHERE v.innovation_center_id=$1 AND v.year=$2 AND v.deleted_at IS NULL
       AND ($3::int IS NULL OR v.month=$3 OR ($5::boolean AND v.month IS NULL))
       AND ($4::uuid IS NULL OR v.indicator_id=$4)
     ORDER BY d.category,d.sort_order,d.name,v.month NULLS LAST`,
    [centerId, year, month, indicatorId, includeAnnual],
  );
  return rows;
}

export async function valueHistory({ centerId, indicatorId }) {
  const { rows } = await query(
    `${valueProjection}
     WHERE v.innovation_center_id=$1 AND v.indicator_id=$2 AND v.deleted_at IS NULL
     ORDER BY v.year DESC,v.month DESC NULLS LAST,v.updated_at DESC`,
    [centerId, indicatorId],
  );
  return rows;
}

export async function findValue(id) {
  const { rows } = await query(`${valueProjection} WHERE v.id=$1 AND v.deleted_at IS NULL`, [id]);
  return rows[0];
}

export async function upsertValue(data, userId, client = { query }) {
  const existing = await client.query(
    `SELECT id FROM indicator_values WHERE indicator_id=$1 AND innovation_center_id=$2 AND year=$3
       AND month IS NOT DISTINCT FROM $4 AND source_type=$5 AND deleted_at IS NULL FOR UPDATE`,
    [data.indicatorId, data.centerId, data.year, data.month, data.sourceType],
  );
  if (existing.rows[0]) {
    const { rows } = await client.query(
      `UPDATE indicator_values SET numeric_value=$2,text_value=$3,json_value=$4,notes=$5,
         period_start=$6,period_end=$7,updated_by=$8,consolidated_at=NOW(),updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [existing.rows[0].id, data.numericValue, data.textValue, data.jsonValue, data.notes,
        data.periodStart, data.periodEnd, userId],
    );
    return { ...rows[0], created: false };
  }
  const { rows } = await client.query(
    `INSERT INTO indicator_values(indicator_id,innovation_center_id,year,month,period_start,period_end,
       numeric_value,text_value,json_value,source_type,notes,created_by,updated_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
    [data.indicatorId, data.centerId, data.year, data.month, data.periodStart, data.periodEnd,
      data.numericValue, data.textValue, data.jsonValue, data.sourceType, data.notes, userId],
  );
  return { ...rows[0], created: true };
}

export async function deleteManualValue(id, userId) {
  const { rows } = await query(
    `UPDATE indicator_values SET deleted_at=NOW(),updated_by=$2,updated_at=NOW()
     WHERE id=$1 AND source_type='MANUAL_ENTRY' AND deleted_at IS NULL RETURNING *`,
    [id, userId],
  );
  return rows[0];
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function listRecords({ centerId, type, year = null, month = null, search = null, includeInactive = false }) {
  const { rows } = await query(
    `SELECT * FROM indicator_records
     WHERE innovation_center_id=$1 AND record_type=$2 AND deleted_at IS NULL
       AND ($3::boolean OR active)
       AND ($4::int IS NULL OR year=$4 OR EXTRACT(YEAR FROM COALESCE(event_at,start_date))=$4)
       AND ($5::int IS NULL OR month=$5 OR EXTRACT(MONTH FROM COALESCE(event_at,start_date))=$5)
       AND ($6::text IS NULL OR name ILIKE '%'||$6||'%' OR municipality ILIKE '%'||$6||'%')
     ORDER BY COALESCE(event_at,start_date,created_at) DESC,name`,
    [centerId, type, includeInactive, year, month, search],
  );
  return rows;
}

export async function findRecord(id) {
  const { rows } = await query('SELECT * FROM indicator_records WHERE id=$1 AND deleted_at IS NULL', [id]);
  return rows[0];
}

const recordColumns = Object.freeze([
  'innovation_center_id','record_type','name','description','start_date','end_date','event_at','continuous',
  'location','theme','mode','subtype','participants','participating_companies','municipality','in_region','served',
  'support_type','amount','contribution_periodicity','sector','result','program_name','development_stage',
  'collaborators_entry','collaborators_exit','intellectual_property','funds_raised','annual_revenue',
  'international_relationships','challenges','solutions','deals','year','month','active','extra'
]);

export async function createRecord(data, userId) {
  const values = recordColumns.map((column) => data[column] ?? null);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(',');
  const { rows } = await query(
    `INSERT INTO indicator_records(${recordColumns.join(',')},created_by,updated_by)
     VALUES(${placeholders},$${values.length + 1},$${values.length + 1}) RETURNING *`,
    [...values, userId],
  );
  return rows[0];
}

export async function updateRecord(id, data, userId) {
  const values = recordColumns.map((column) => data[column] ?? null);
  const assignments = recordColumns.map((column, index) => `${column}=$${index + 2}`).join(',');
  const { rows } = await query(
    `UPDATE indicator_records SET ${assignments},updated_by=$${values.length + 2},updated_at=NOW()
     WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
    [id, ...values, userId],
  );
  return rows[0];
}

export async function deleteRecord(id, userId) {
  const { rows } = await query(
    `UPDATE indicator_records SET active=FALSE,deleted_at=NOW(),updated_by=$2,updated_at=NOW()
     WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
    [id, userId],
  );
  return rows[0];
}

export async function recordsForCalculation(centerId, year) {
  const { rows } = await query(
    `SELECT * FROM indicator_records WHERE innovation_center_id=$1 AND deleted_at IS NULL
       AND ((year IS NULL AND event_at IS NULL AND start_date IS NULL) OR year=$2 OR EXTRACT(YEAR FROM event_at)=$2
         OR (start_date<=make_date($2,12,31) AND (end_date IS NULL OR end_date>=make_date($2,1,1))))`,
    [centerId, year],
  );
  return rows;
}

export async function manualValuesForCalculation(centerId, year) {
  const { rows } = await query(
    `SELECT v.*,d.code,d.value_type,d.annual_aggregation FROM indicator_values v
     JOIN indicator_definitions d ON d.id=v.indicator_id
     WHERE v.innovation_center_id=$1 AND v.year=$2
       AND v.source_type='MANUAL_ENTRY'
       AND v.deleted_at IS NULL AND v.month IS NOT NULL`,
    [centerId, year],
  );
  return rows;
}

export async function allDefinitions() {
  const { rows } = await query(
    `SELECT * FROM indicator_definitions WHERE active`,
  );
  return rows;
}

export async function clearSystemValues(centerId, year, userId, client = { query }) {
  await client.query(
    `UPDATE indicator_values SET deleted_at=NOW(),updated_by=$3,updated_at=NOW()
     WHERE innovation_center_id=$1 AND year=$2
       AND source_type='SYSTEM_CALCULATION' AND deleted_at IS NULL`,
    [centerId, year, userId],
  );
}
