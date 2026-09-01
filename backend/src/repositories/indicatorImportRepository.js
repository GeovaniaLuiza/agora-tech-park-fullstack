import { pool, query } from '../db/pool.js';

export async function findCenter(id) {
  const { rows } = await query('SELECT id,code,name FROM innovation_centers WHERE id=$1 AND active', [id]);
  return rows[0];
}

export async function findPrevious({ fileHash, importType, centerId }) {
  const { rows } = await query(
    `SELECT id,file_name,status,summary,created_at,confirmed_at FROM indicator_import_batches
     WHERE file_hash=$1 AND import_type=$2 AND innovation_center_id=$3
     ORDER BY created_at DESC LIMIT 1`,
    [fileHash, importType, centerId],
  );
  return rows[0];
}

export async function createBatch(data) {
  const { rows } = await query(
    `INSERT INTO indicator_import_batches(
       import_type,file_name,file_hash,file_size,mime_type,sheet_name,innovation_center_id,year,status,
       total_records,total_ignored,total_warnings,summary,warnings,draft,created_by
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16)
     RETURNING *`,
    [data.importType, data.fileName, data.fileHash, data.fileSize, data.mimeType, data.sheetName,
      data.centerId, data.year, data.status, data.totalRecords, data.totalIgnored, data.totalWarnings,
      JSON.stringify(data.summary), JSON.stringify(data.warnings), JSON.stringify(data.draft), data.userId],
  );
  return rows[0];
}

export async function findBatch(id) {
  const { rows } = await query(
    `SELECT b.*,c.name AS center_name,u.name AS created_by_name
     FROM indicator_import_batches b JOIN innovation_centers c ON c.id=b.innovation_center_id
     LEFT JOIN users u ON u.id=b.created_by WHERE b.id=$1`, [id],
  );
  return rows[0];
}

export async function latestDraft({ importType, centerId, userId }) {
  const { rows } = await query(
    `SELECT b.*,c.name AS center_name FROM indicator_import_batches b
     JOIN innovation_centers c ON c.id=b.innovation_center_id
     WHERE b.import_type=$1 AND b.innovation_center_id=$2 AND b.created_by=$3
       AND b.status IN ('REVIEW_PENDING','WITH_WARNINGS','VALIDATED')
     ORDER BY b.updated_at DESC LIMIT 1`,
    [importType, centerId, userId],
  );
  return rows[0];
}

export async function saveDraft(id, { draft, summary, warnings, status }) {
  const { rows } = await query(
    `UPDATE indicator_import_batches SET draft=$2::jsonb,summary=$3::jsonb,warnings=$4::jsonb,status=$5,
       total_records=$6,total_ignored=$7,total_warnings=$8,updated_at=NOW()
     WHERE id=$1 AND status IN ('REVIEW_PENDING','WITH_WARNINGS','VALIDATED') RETURNING *`,
    [id, JSON.stringify(draft), JSON.stringify(summary), JSON.stringify(warnings), status,
      summary.records || 0, summary.excluded || 0, warnings.length],
  );
  return rows[0];
}

export async function replaceBatchRecords(batch, records, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE indicator_records r SET active=FALSE,deleted_at=NOW(),updated_at=NOW(),updated_by=$5
       FROM indicator_import_batches b
       WHERE r.import_batch_id=b.id AND r.active AND r.deleted_at IS NULL
         AND b.file_hash=$1 AND b.import_type=$2 AND b.innovation_center_id=$3 AND b.year=$4`,
      [batch.file_hash, batch.import_type, batch.innovation_center_id, batch.year, userId],
    );
    for (const record of records) {
      await client.query(
        `INSERT INTO indicator_records(
           innovation_center_id,record_type,name,start_date,end_date,event_at,location,theme,mode,subtype,
           participants,participating_companies,sector,result,program_name,collaborators_entry,collaborators_exit,
           intellectual_property,funds_raised,annual_revenue,international_relationships,active,extra,
           import_batch_id,source_rows,created_by,updated_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,TRUE,$22::jsonb,$23,$24,$25,$25)`,
        [batch.innovation_center_id, record.recordType, record.name, record.startDate, record.endDate,
          record.eventAt, record.location, record.theme, record.mode, record.subtype, record.participants,
          record.participatingCompanies, record.sector, record.result, record.programName,
          record.collaboratorsEntry, record.collaboratorsExit, record.intellectualProperty,
          record.fundsRaised, record.annualRevenue, record.internationalRelationships,
          JSON.stringify(record.extra || {}), batch.id, record.sourceRows, userId],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function markImported(id, { imported, ignored, summary, userId }) {
  const { rows } = await query(
    `UPDATE indicator_import_batches SET status='IMPORTED',total_imported=$2,total_ignored=$3,
       summary=$4::jsonb,confirmed_by=$5,confirmed_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id, imported, ignored, JSON.stringify(summary), userId],
  );
  return rows[0];
}

export async function recordsForOfficialWorkbook(centerId, year) {
  const { rows } = await query(
    `SELECT r.*,b.file_name,b.sheet_name,b.file_hash FROM indicator_records r
     LEFT JOIN indicator_import_batches b ON b.id=r.import_batch_id
     WHERE r.innovation_center_id=$1 AND r.record_type IN ('EVENT','RESIDENT_COMPANY')
       AND r.active AND r.deleted_at IS NULL
       AND (EXTRACT(YEAR FROM r.event_at)=$2::int OR (r.start_date<=make_date($2::int,12,31) AND (r.end_date IS NULL OR r.end_date>=make_date($2::int,1,1))))
     ORDER BY r.record_type,COALESCE(r.event_at,r.start_date),r.name`,
    [centerId, year],
  );
  return rows;
}
