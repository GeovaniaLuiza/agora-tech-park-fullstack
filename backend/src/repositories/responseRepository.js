import { pool, query } from '../db/pool.js';

export async function submissionContext(formId, organizationId) {
  const { rows } = await query(
    `SELECT f.id,f.status,f.start_date,f.end_date,
      (NOT EXISTS (SELECT 1 FROM form_organizations fo WHERE fo.form_id=f.id)
       OR EXISTS (SELECT 1 FROM form_organizations fo WHERE fo.form_id=f.id AND fo.organization_id=$2)) AS targeted
     FROM forms f WHERE f.id=$1`,
    [formId, organizationId],
  );
  return rows[0];
}

export async function formQuestions(formId) {
  const { rows } = await query(
    `SELECT q.id,q.label,q.type,q.required,
      COALESCE(json_agg(qo.value ORDER BY qo.created_at) FILTER (WHERE qo.id IS NOT NULL),'[]') AS options
     FROM questions q LEFT JOIN question_options qo ON qo.question_id=q.id
     WHERE q.form_id=$1 GROUP BY q.id ORDER BY q.position,q.created_at`,
    [formId],
  );
  return rows;
}

async function persist({ formId, organizationId, userId, answers, submit }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id,status FROM responses WHERE form_id=$1 AND organization_id=$2 FOR UPDATE`,
      [formId, organizationId],
    );
    if (current.rows[0]?.status === 'SUBMITTED') {
      await client.query('ROLLBACK');
      return { conflict: true };
    }
    let responseId = current.rows[0]?.id;
    if (!responseId) {
      const created = await client.query(
        `INSERT INTO responses(form_id,organization_id,answered_by,status,submitted_at)
         VALUES($1,$2,$3,$4::varchar,CASE WHEN $4::varchar='SUBMITTED' THEN NOW() END) RETURNING id`,
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
    await client.query('COMMIT');
    return { id: responseId, status: submit ? 'SUBMITTED' : (current.rows[0]?.status || 'DRAFT') };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const saveDraft = (data) => persist({ ...data, submit: false });
export const submit = (data) => persist({ ...data, submit: true });

export async function reopen(responseId, userId) {
  const { rows } = await query(
    `UPDATE responses SET status='REOPENED',reopened_at=NOW(),reopened_by=$2
     WHERE id=$1 AND status='SUBMITTED' RETURNING id,form_id,organization_id,status,reopened_at`,
    [responseId, userId],
  );
  return rows[0];
}

export async function history(organizationId) {
  const { rows } = await query(
    `SELECT r.id,r.form_id,f.title,r.status,r.submitted_at AS sent_at,r.updated_at
     FROM responses r JOIN forms f ON f.id=r.form_id
     WHERE r.organization_id=$1 ORDER BY r.updated_at DESC`,
    [organizationId],
  );
  return rows;
}

export async function findByFormAndOrganization(formId, organizationId) {
  const { rows } = await query(
    `SELECT r.id,r.form_id,r.organization_id,r.status,r.created_at,r.updated_at,
      r.submitted_at,r.reopened_at
     FROM responses r WHERE r.form_id=$1 AND r.organization_id=$2`,
    [formId, organizationId],
  );
  return rows[0];
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
