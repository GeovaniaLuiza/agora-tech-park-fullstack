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
  const { rows } = await client.query(
    `INSERT INTO indicator_values(
       indicator_id,organization_id,innovation_center_id,year,month,period_start,period_end,
       numeric_value,text_value,json_value,source_type,source_id,created_by,updated_by,consolidated_at
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'FORM_RESPONSE',$11,$12,$12,NOW())
     ON CONFLICT (indicator_id,innovation_center_id,year,COALESCE(month,0),source_type)
       WHERE deleted_at IS NULL
     DO UPDATE SET organization_id=EXCLUDED.organization_id,period_start=EXCLUDED.period_start,
       period_end=EXCLUDED.period_end,numeric_value=EXCLUDED.numeric_value,
       text_value=EXCLUDED.text_value,json_value=EXCLUDED.json_value,
       source_id=EXCLUDED.source_id,updated_by=EXCLUDED.updated_by,
       consolidated_at=NOW(),updated_at=NOW()
     RETURNING id,(xmax=0) AS created`,
    [data.indicatorId, data.organizationId, data.centerId, data.year, data.month,
      data.periodStart, data.periodEnd, data.numericValue, data.textValue, data.jsonValue,
      data.responseId, data.userId],
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

export async function upsertAnnualValue({ indicatorId, centerId, year, sourceType, responseId, userId }, client) {
  const { rows } = await client.query(
    `INSERT INTO indicator_values(indicator_id,organization_id,innovation_center_id,year,month,
       period_start,period_end,numeric_value,text_value,source_type,source_id,created_by,updated_by,consolidated_at)
     SELECT d.id,(array_agg(v.organization_id ORDER BY v.month DESC))[1],$2,$3,NULL,
       make_date($3,1,1),make_date($3,12,31),
       CASE WHEN COALESCE(d.annual_aggregation,d.aggregation_type)='AVERAGE' THEN AVG(v.numeric_value)
         WHEN COALESCE(d.annual_aggregation,d.aggregation_type)='LAST_VALUE' THEN
           (array_agg(v.numeric_value ORDER BY v.month DESC) FILTER (WHERE v.numeric_value IS NOT NULL))[1]
         ELSE SUM(v.numeric_value) END,
       (array_agg(v.text_value ORDER BY v.month DESC) FILTER (WHERE v.text_value IS NOT NULL))[1],
       $4::varchar,$5::uuid,$6::uuid,$6::uuid,NOW()
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
