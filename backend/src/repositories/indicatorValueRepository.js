export async function findDefinition(indicatorId, client) {
  const { rows } = await client.query(
    `SELECT id,code,name,category,unit,value_type,periodicity,aggregation_type,
      calculation_type,annual_aggregation,active
     FROM indicator_definitions WHERE id=$1`,
    [indicatorId],
  );
  return rows[0];
}

export async function upsertFormValue(data, client) {
  await client.query(
    `INSERT INTO indicator_records(innovation_center_id,record_type,name,source_type,response_id,
       question_id,indicator_id,organization_id,year,month,numeric_value,created_by,updated_by)
     SELECT $1,'FORM_RESPONSE',d.name,'FORM_RESPONSE',$2,$3,d.id,$5,$6,$7,$8,$9,$9
     FROM indicator_definitions d WHERE d.id=$4
     ON CONFLICT (response_id,question_id,indicator_id) WHERE record_type='FORM_RESPONSE'
     DO UPDATE SET numeric_value=EXCLUDED.numeric_value,active=TRUE,deleted_at=NULL,
       updated_by=EXCLUDED.updated_by
     WHERE indicator_records.numeric_value IS DISTINCT FROM EXCLUDED.numeric_value
       OR NOT indicator_records.active OR indicator_records.deleted_at IS NOT NULL
     RETURNING id`,
    [data.centerId, data.responseId, data.questionId, data.indicatorId, data.organizationId,
      data.year, data.month, data.numericValue, data.userId],
  );
  return consolidateFormValues(data, client);
}

export async function lockFormPeriod(centerId, year, client) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`form-indicators:${centerId}:${year}`]);
}

export async function hasLegacyFormValues({ centerId, year, responseId, indicatorIds }, client) {
  const { rows } = await client.query(
    `SELECT EXISTS(SELECT 1 FROM indicator_values v
     WHERE v.innovation_center_id=$1 AND v.year=$2 AND v.source_type='FORM_RESPONSE'
       AND v.deleted_at IS NULL AND v.source_id IS NOT NULL
       AND (v.source_id=$3 OR v.indicator_id=ANY($4::uuid[]))) AS legacy`,
    [centerId, year, responseId, indicatorIds],
  );
  return rows[0].legacy;
}

export async function deactivateMissingContributions({ responseId, questionIds, userId }, client) {
  const { rows } = await client.query(
    `UPDATE indicator_records SET active=FALSE,updated_by=$3
     WHERE response_id=$1 AND record_type='FORM_RESPONSE' AND active
       AND NOT (question_id=ANY($2::uuid[]))
     RETURNING indicator_id AS "indicatorId",innovation_center_id AS "centerId",year,month,
       (SELECT code FROM indicator_definitions WHERE id=indicator_records.indicator_id) AS code`,
    [responseId, questionIds, userId],
  );
  for (const row of rows) {
    await consolidateFormValues({ ...row, responseId, userId }, client);
    await upsertAnnualValue({ ...row, sourceType: 'FORM_RESPONSE', responseId, userId }, client);
  }
  return rows;
}

async function consolidateFormValues(data, client) {
  // Definitions are validated by the service; there is no implicit aggregation fallback.
  await client.query(
    `UPDATE indicator_values SET deleted_at=NOW(),updated_by=$5
     WHERE indicator_id=$1 AND innovation_center_id=$2 AND year=$3 AND month=$4
       AND source_type='FORM_RESPONSE' AND deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM indicator_records r WHERE r.indicator_id=$1
         AND r.innovation_center_id=$2 AND r.year=$3 AND r.month=$4
         AND r.record_type='FORM_RESPONSE' AND r.active AND r.deleted_at IS NULL)`,
    [data.indicatorId, data.centerId, data.year, data.month, data.userId],
  );
  const { rows } = await client.query(
    `INSERT INTO indicator_values(
       indicator_id,organization_id,innovation_center_id,year,month,period_start,period_end,
       numeric_value,text_value,json_value,source_type,source_id,created_by,updated_by,consolidated_at
     ) SELECT $1,NULL,$2,$3::int,$4::int,make_date($3::int,$4::int,1),
       (make_date($3::int,$4::int,1)+INTERVAL '1 month - 1 day')::date,
       CASE d.aggregation_type WHEN 'SUM' THEN SUM(r.numeric_value)
         WHEN 'COUNT' THEN COUNT(*)::numeric WHEN 'AVERAGE' THEN AVG(r.numeric_value)
         WHEN 'LAST_VALUE' THEN (array_agg(r.numeric_value ORDER BY r.updated_at DESC,r.id DESC))[1] END,
       NULL,NULL,'FORM_RESPONSE',NULL,$5,$5,NOW()
     FROM indicator_records r JOIN indicator_definitions d ON d.id=r.indicator_id
     WHERE r.indicator_id=$1 AND r.innovation_center_id=$2 AND r.year=$3 AND r.month=$4
       AND r.record_type='FORM_RESPONSE' AND r.active AND r.deleted_at IS NULL
     GROUP BY d.aggregation_type
     ON CONFLICT (indicator_id,innovation_center_id,year,COALESCE(month,0),source_type)
       WHERE deleted_at IS NULL
     DO UPDATE SET organization_id=EXCLUDED.organization_id,period_start=EXCLUDED.period_start,
       period_end=EXCLUDED.period_end,numeric_value=EXCLUDED.numeric_value,
       text_value=EXCLUDED.text_value,json_value=EXCLUDED.json_value,
       source_id=NULL,updated_by=EXCLUDED.updated_by,
       consolidated_at=NOW(),updated_at=NOW()
     RETURNING id,(xmax=0) AS created`,
    [data.indicatorId, data.centerId, data.year, data.month, data.userId],
  );
  return rows[0];
}

export async function valueByCode(code, centerId, year, month, client) {
  const { rows } = await client.query(
    `SELECT v.numeric_value FROM indicator_values v
     JOIN indicator_definitions d ON d.id=v.indicator_id
     WHERE d.code=$1 AND v.innovation_center_id=$2 AND v.year=$3 AND v.month=$4
       AND v.deleted_at IS NULL
       AND v.source_type IN ('FORM_RESPONSE','MANUAL_ENTRY','SYSTEM_CALCULATION','SPREADSHEET_IMPORT')
     ORDER BY CASE v.source_type WHEN 'FORM_RESPONSE' THEN 1 WHEN 'SYSTEM_CALCULATION' THEN 2
       WHEN 'MANUAL_ENTRY' THEN 3 ELSE 4 END,v.updated_at DESC LIMIT 1`,
    [code, centerId, year, month],
  );
  return rows[0]?.numeric_value == null ? null : Number(rows[0].numeric_value);
}

export async function upsertDerivedResult(data, client) {
  const { rows } = await client.query(
    `INSERT INTO indicator_values(
       indicator_id,innovation_center_id,year,month,period_start,period_end,numeric_value,
       source_type,source_id,created_by,updated_by,consolidated_at
     ) SELECT id,$1,$2,$3,$4,$5,$6,'SYSTEM_CALCULATION',$7,$8,$8,NOW()
       FROM indicator_definitions WHERE code='RESULTADO_ANUAL_CENTRO' AND active
     ON CONFLICT (indicator_id,innovation_center_id,year,COALESCE(month,0),source_type)
       WHERE deleted_at IS NULL
     DO UPDATE SET numeric_value=EXCLUDED.numeric_value,source_id=EXCLUDED.source_id,
       updated_by=EXCLUDED.updated_by,consolidated_at=NOW(),updated_at=NOW()
     RETURNING id,(xmax=0) AS created`,
    [data.centerId, data.year, data.month, data.periodStart, data.periodEnd,
      data.value, data.responseId, data.userId],
  );
  return rows[0];
}

export async function clearDerivedResult({ centerId, year, month, responseId, userId }, client) {
  const definition = await client.query("SELECT id FROM indicator_definitions WHERE code='RESULTADO_ANUAL_CENTRO'");
  if (!definition.rows[0]) return;
  const indicatorId = definition.rows[0].id;
  await client.query(
    `UPDATE indicator_values SET deleted_at=NOW(),updated_by=$5
     WHERE indicator_id=$1 AND innovation_center_id=$2 AND year=$3 AND month=$4
       AND source_type='SYSTEM_CALCULATION' AND deleted_at IS NULL`,
    [indicatorId, centerId, year, month, userId],
  );
  await upsertAnnualValue({ indicatorId, centerId, year, sourceType: 'SYSTEM_CALCULATION', responseId, userId }, client);
}

export async function upsertAnnualValue({ indicatorId, centerId, year, sourceType, responseId, userId }, client) {
  await client.query(
    `UPDATE indicator_values SET deleted_at=NOW(),updated_by=$5
     WHERE indicator_id=$1 AND innovation_center_id=$2 AND year=$3 AND month IS NULL
       AND source_type=$4 AND deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM indicator_values m WHERE m.indicator_id=$1
         AND m.innovation_center_id=$2 AND m.year=$3 AND m.month IS NOT NULL
         AND m.source_type=$4 AND m.deleted_at IS NULL)`,
    [indicatorId, centerId, year, sourceType, userId],
  );
  const { rows } = await client.query(
    `INSERT INTO indicator_values(indicator_id,organization_id,innovation_center_id,year,month,
       period_start,period_end,numeric_value,text_value,source_type,source_id,created_by,updated_by,consolidated_at)
     SELECT d.id,(array_agg(v.organization_id ORDER BY v.month DESC))[1],$2,$3,NULL,
       make_date($3::int,1,1),make_date($3::int,12,31),
       CASE WHEN COALESCE(d.annual_aggregation,d.aggregation_type)='AVERAGE' THEN AVG(v.numeric_value)
         WHEN COALESCE(d.annual_aggregation,d.aggregation_type)='LAST_VALUE' THEN
           (array_agg(v.numeric_value ORDER BY v.month DESC) FILTER (WHERE v.numeric_value IS NOT NULL))[1]
         WHEN COALESCE(d.annual_aggregation,d.aggregation_type) IN ('SUM','COUNT','DERIVED') THEN SUM(v.numeric_value) END,
       (array_agg(v.text_value ORDER BY v.month DESC) FILTER (WHERE v.text_value IS NOT NULL))[1],
       $4::varchar,CASE WHEN $4='FORM_RESPONSE' THEN NULL ELSE $5::uuid END,$6::uuid,$6::uuid,NOW()
     FROM indicator_definitions d JOIN indicator_values v ON v.indicator_id=d.id
     WHERE d.id=$1 AND v.innovation_center_id=$2 AND v.year=$3 AND v.month IS NOT NULL
       AND v.source_type=$4::varchar AND v.deleted_at IS NULL
     GROUP BY d.id,d.annual_aggregation,d.aggregation_type
     ON CONFLICT (indicator_id,innovation_center_id,year,COALESCE(month,0),source_type)
       WHERE deleted_at IS NULL
     DO UPDATE SET organization_id=EXCLUDED.organization_id,numeric_value=EXCLUDED.numeric_value,
       text_value=EXCLUDED.text_value,source_id=EXCLUDED.source_id,updated_by=EXCLUDED.updated_by,
       consolidated_at=NOW(),updated_at=NOW()
     RETURNING id`,
    [indicatorId, centerId, year, sourceType, responseId, userId],
  );
  return rows[0];
}
