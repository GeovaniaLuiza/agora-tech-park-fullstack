import { pool, query } from '../db/pool.js';

export async function findImported(fileHash, sheetName, year) {
  const { rows } = await query(
    `SELECT id,file_name,sheet_name,year,file_hash,status,imported_at,summary,errors
     FROM spreadsheet_imports WHERE file_hash=$1 AND sheet_name=$2 AND year=$3 AND status='IMPORTED'`,
    [fileHash, sheetName, year],
  );
  return rows[0];
}

export async function findImportedYear(sheetName, year) {
  const { rows } = await query(
    `SELECT id,file_hash,file_name,imported_at FROM spreadsheet_imports
     WHERE sheet_name=$1 AND year=$2 AND status='IMPORTED' ORDER BY imported_at DESC LIMIT 1`,
    [sheetName, year],
  );
  return rows[0];
}

async function upsertDefinition(client, definition) {
  const { rows } = await client.query(
    `INSERT INTO indicator_definitions
      (code,name,description,category,unit,value_type,periodicity,aggregation_type,default_source_type,active)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'SPREADSHEET_IMPORT',TRUE)
     ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
       category=EXCLUDED.category,unit=EXCLUDED.unit,value_type=EXCLUDED.value_type,
       periodicity=EXCLUDED.periodicity,aggregation_type=EXCLUDED.aggregation_type,
       default_source_type=EXCLUDED.default_source_type,active=TRUE
     RETURNING id,code`,
    [definition.code, definition.name, definition.description, definition.category, definition.unit,
      definition.valueType, definition.periodicity, definition.aggregationType],
  );
  return rows[0];
}

export async function persistImport({ fileName, fileHash, parsed, userId = null, reprocess = false }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id,file_hash FROM spreadsheet_imports
       WHERE sheet_name=$1 AND year=$2 AND status='IMPORTED' FOR UPDATE`,
      [parsed.sheetName, parsed.year],
    );
    const sameFile = existing.rows.find((row) => row.file_hash === fileHash);
    if (sameFile && !reprocess) {
      await client.query('ROLLBACK');
      return { duplicate: true, id: sameFile.id };
    }
    if (existing.rowCount && !reprocess) {
      await client.query('ROLLBACK');
      return { conflict: true, id: existing.rows[0].id };
    }

    const summary = { definitions: parsed.definitions.length, values: parsed.values.length, warnings: parsed.errors.length };
    const created = sameFile
      ? await client.query(
        `UPDATE spreadsheet_imports SET file_name=$1,imported_by=$2,imported_at=NOW(),
           summary=$3::jsonb,errors=$4::jsonb WHERE id=$5 RETURNING id,imported_at`,
        [fileName, userId, JSON.stringify(summary), JSON.stringify(parsed.errors), sameFile.id],
      )
      : await client.query(
        `INSERT INTO spreadsheet_imports
          (file_name,sheet_name,year,file_hash,status,imported_by,imported_at,summary,errors)
         VALUES($1,$2,$3,$4,'IMPORTED',$5,NOW(),$6::jsonb,$7::jsonb) RETURNING id,imported_at`,
        [fileName, parsed.sheetName, parsed.year, fileHash, userId, JSON.stringify(summary), JSON.stringify(parsed.errors)],
      );
    const importId = created.rows[0].id;
    const ids = new Map();
    for (const definition of parsed.definitions) {
      const saved = await upsertDefinition(client, definition);
      ids.set(saved.code, saved.id);
    }
    if (reprocess) {
      await client.query(
        `DELETE FROM indicator_values WHERE year=$1 AND source_type='SPREADSHEET_IMPORT'
         AND indicator_id=ANY($2::uuid[])`,
        [parsed.year, [...ids.values()]],
      );
    }
    for (const value of parsed.values) {
      await client.query(
        `INSERT INTO indicator_values
          (indicator_id,year,month,period_start,period_end,numeric_value,text_value,json_value,
           source_type,source_id,spreadsheet_import_id,consolidated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,NOW())
         ON CONFLICT (indicator_id,year,(COALESCE(month,0)),
           (COALESCE(organization_id,'00000000-0000-0000-0000-000000000000'::uuid)),source_type)
         DO UPDATE SET period_start=EXCLUDED.period_start,period_end=EXCLUDED.period_end,
           numeric_value=EXCLUDED.numeric_value,text_value=EXCLUDED.text_value,json_value=EXCLUDED.json_value,
           source_id=EXCLUDED.source_id,spreadsheet_import_id=EXCLUDED.spreadsheet_import_id,consolidated_at=NOW()`,
        [ids.get(value.code), value.year, value.month, value.periodStart, value.periodEnd,
          value.numericValue ?? null, value.textValue ?? null,
          value.jsonValue === undefined ? null : JSON.stringify(value.jsonValue), value.sourceType,
          importId, importId],
      );
    }
    await client.query(
      `INSERT INTO audit_logs(user_id,action,entity,entity_id,details)
       VALUES($1,'SPREADSHEET_IMPORTED','spreadsheet_import',$2,$3::jsonb)`,
      [userId, importId, JSON.stringify({ fileName, fileHash, sheetName: parsed.sheetName, year: parsed.year, ...summary, reprocess })],
    );
    await client.query('COMMIT');
    return { id: importId, importedAt: created.rows[0].imported_at, summary, errors: parsed.errors };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
