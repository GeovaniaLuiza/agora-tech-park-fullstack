import { pool, query } from '../db/pool.js';

export async function submissionContext(formId, organizationId, userId) {
  const { rows } = await query(
    `SELECT f.id,f.status,f.start_date,f.end_date,f.innovation_center_id,f.indicator_year,f.indicator_month,o.id AS organization_id,
      (NOT EXISTS (SELECT 1 FROM form_organizations fo WHERE fo.form_id=f.id)
       OR EXISTS (SELECT 1 FROM form_organizations fo WHERE fo.form_id=f.id AND fo.organization_id=o.id))
      AND (NOT EXISTS (SELECT 1 FROM form_respondents fr WHERE fr.form_id=f.id)
        OR EXISTS (SELECT 1 FROM form_respondents fr WHERE fr.form_id=f.id AND fr.user_id=$3 AND fr.organization_id=o.id)) AS targeted
     FROM forms f JOIN users_organizations uo ON uo.user_id=$3 AND uo.active
     JOIN organizations o ON o.id=uo.organization_id AND o.status='ACTIVE' AND o.id=$2
     WHERE f.id=$1`,
    [formId, organizationId, userId],
  );
  return rows[0];
}

export async function formQuestions(formId) {
  const { rows } = await query(
    `SELECT q.id,q.label,q.type,q.required,qil.indicator_id,
      COALESCE(json_agg(qo.value ORDER BY qo.created_at) FILTER (WHERE qo.id IS NOT NULL),'[]') AS options
     FROM questions q LEFT JOIN question_options qo ON qo.question_id=q.id
     LEFT JOIN question_indicator_links qil ON qil.question_id=q.id AND qil.active
     WHERE q.form_id=$1 GROUP BY q.id,qil.indicator_id ORDER BY q.position,q.created_at`,
    [formId],
  );
  return rows;
}

async function persist({ formId, organizationId, userId, answers, submit, processSubmission }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`response:${formId}:${organizationId}:${userId}`]);
    // Unassigned history must be reconciled explicitly before another contribution.
    const legacy = await client.query(
      'SELECT id FROM responses WHERE form_id=$1 AND organization_id=$2 AND respondent_user_id IS NULL FOR UPDATE',
      [formId, organizationId],
    );
    if (legacy.rows.length) {
      await client.query('ROLLBACK');
      return { legacyConflict: true };
    }
    const current = await client.query(
      `SELECT id,status FROM responses WHERE form_id=$1 AND organization_id=$2 AND respondent_user_id=$3 FOR UPDATE`,
      [formId, organizationId, userId],
    );
    if (current.rows[0]?.status === 'SUBMITTED') {
      await client.query('ROLLBACK');
      return { conflict: true };
    }
    let responseId = current.rows[0]?.id;
    if (!responseId) {
      const created = await client.query(
        `INSERT INTO responses(form_id,organization_id,respondent_user_id,answered_by,status,submitted_at)
         VALUES($1,$2,$3,$3,$4::varchar,CASE WHEN $4::varchar='SUBMITTED' THEN NOW() END) RETURNING id`,
        [formId, organizationId, userId, submit ? 'SUBMITTED' : 'DRAFT'],
      );
      responseId = created.rows[0].id;
    } else {
      await client.query(
        `UPDATE responses SET answered_by=$2,status=$3,
          submitted_at=CASE WHEN $3::varchar='SUBMITTED' THEN NOW() ELSE submitted_at END
         WHERE id=$1`,
        [responseId, userId, submit ? 'SUBMITTED' : current.rows[0].status],
      );
      await client.query('DELETE FROM answers WHERE response_id=$1', [responseId]);
    }
    for (const answer of answers) {
      await client.query(
        `INSERT INTO answers(response_id,question_id,value) VALUES($1,$2,$3)`,
        [responseId, answer.questionId, String(answer.value)],
      );
    }
    let indicatorsUpdated = 0;
    if (submit && processSubmission) indicatorsUpdated = await processSubmission(responseId, client);
    await client.query('COMMIT');
    return { id: responseId, status: submit ? 'SUBMITTED' : (current.rows[0]?.status || 'DRAFT'), indicatorsUpdated };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const saveDraft = (data) => persist({ ...data, submit: false });
export const submit = (data) => persist({ ...data, submit: true });

export async function reopen(responseId, userId, processReopen) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE responses SET status='REOPENED',reopened_at=NOW(),reopened_by=$2
       WHERE id=$1 AND status='SUBMITTED' AND respondent_user_id IS NOT NULL
       RETURNING id,form_id,organization_id,respondent_user_id,status,reopened_at`,
      [responseId, userId],
    );
    if (rows[0] && processReopen) {
      const context = await client.query(
        `SELECT r.organization_id,f.innovation_center_id,f.indicator_year,f.indicator_month
         FROM responses r JOIN forms f ON f.id=r.form_id WHERE r.id=$1`, [responseId]);
      await processReopen(context.rows[0], client);
    }
    await client.query('COMMIT');
    return rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function history(organizationId, userId = null) {
  const { rows } = await query(
    `SELECT r.id,r.form_id,r.respondent_user_id,f.title,r.status,r.submitted_at AS sent_at,r.updated_at
     FROM responses r JOIN forms f ON f.id=r.form_id
     WHERE r.organization_id=$1 AND ($2::uuid IS NULL OR r.respondent_user_id=$2) ORDER BY r.updated_at DESC`,
    [organizationId, userId],
  );
  return rows;
}

export async function findByFormAndOrganization(formId, organizationId, userId = null, responseId = null) {
  const { rows } = await query(
    `SELECT r.id,r.form_id,r.organization_id,r.respondent_user_id,r.answered_by,r.status,r.created_at,r.updated_at,
      r.submitted_at,r.reopened_at
     FROM responses r WHERE r.form_id=$1 AND r.organization_id=$2
       AND ($3::uuid IS NULL OR r.respondent_user_id=$3)
       AND ($4::uuid IS NULL OR r.id=$4)`,
    [formId, organizationId, userId, responseId],
  );
  // Staff may inspect all respondents, but must select explicitly when ambiguous.
  return rows.length > 1 ? { ambiguous: true } : rows[0];
}

export async function getAnswers(responseId) {
  const { rows } = await query(
    `SELECT a.id,a.question_id,a.value,q.label,q.type
     FROM answers a JOIN questions q ON q.id=a.question_id
     WHERE a.response_id=$1 ORDER BY q.position,q.created_at`,
    [responseId],
  );
  return rows;
}
