import { pool, query } from '../db/pool.js';

const projection = `SELECT f.id,f.title,f.description,f.status,f.start_date,f.end_date,
  f.created_by,f.created_at,f.updated_at,f.published_at,f.closed_at,f.archived_at,
  f.innovation_center_id,f.indicator_year,f.indicator_month,
  u.name AS owner,
  CASE WHEN f.start_date IS NULL OR f.end_date IS NULL THEN NULL
    ELSE to_char(f.start_date, 'DD/MM/YYYY') || ' - ' || to_char(f.end_date, 'DD/MM/YYYY') END AS period,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status='SUBMITTED')::int AS responses,
  CASE WHEN COUNT(DISTINCT fo.organization_id)=0
    THEN (SELECT COUNT(*)::int FROM organizations WHERE status='ACTIVE')
    ELSE COUNT(DISTINCT fo.organization_id)::int END AS total
  FROM forms f
  JOIN users u ON u.id=f.created_by
  LEFT JOIN responses r ON r.form_id=f.id
  LEFT JOIN form_organizations fo ON fo.form_id=f.id`;

const group = `GROUP BY f.id,u.name`;

export async function findAll(user) {
  const resident = user.role === 'RESIDENTE';
  const params = resident ? [user.sub] : [];
  const scope = resident
    ? `f.status='ACTIVE' AND EXISTS (
        SELECT 1 FROM users_organizations uo
        WHERE uo.user_id=$1 AND uo.active
          AND (NOT EXISTS (SELECT 1 FROM form_organizations x WHERE x.form_id=f.id)
            OR EXISTS (SELECT 1 FROM form_organizations x WHERE x.form_id=f.id AND x.organization_id=uo.organization_id))
      )`
    : `f.status<>'ARCHIVED'`;
  const { rows } = await query(`${projection} WHERE ${scope} ${group} ORDER BY f.created_at DESC`, params);
  return rows;
}

export async function findById(id, user) {
  const params = [id];
  let scope = `f.id=$1 AND f.status<>'ARCHIVED'`;
  if (user?.role === 'RESIDENTE') {
    params.push(user.sub);
    scope += ` AND f.status='ACTIVE' AND EXISTS (
      SELECT 1 FROM users_organizations uo
      WHERE uo.user_id=$2 AND uo.active
        AND (NOT EXISTS (SELECT 1 FROM form_organizations x WHERE x.form_id=f.id)
          OR EXISTS (SELECT 1 FROM form_organizations x WHERE x.form_id=f.id AND x.organization_id=uo.organization_id))
    )`;
  }
  const { rows } = await query(`${projection} WHERE ${scope} ${group}`, params);
  return rows[0];
}

export async function findState(id, client = { query }) {
  const { rows } = await client.query(
    `SELECT id,title,status,start_date,end_date,created_by,innovation_center_id,indicator_year,indicator_month
     FROM forms WHERE id=$1`,
    [id],
  );
  return rows[0];
}

export async function create({ title, description = '', startDate, endDate, innovationCenterId = null, indicatorYear = null, indicatorMonth = null, createdBy }) {
  const { rows } = await query(
    `INSERT INTO forms(title,description,start_date,end_date,innovation_center_id,indicator_year,indicator_month,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [title, description, startDate || null, endDate || null, innovationCenterId, indicatorYear, indicatorMonth, createdBy],
  );
  return findById(rows[0].id);
}

export async function update(id, { title, description, startDate, endDate, innovationCenterId, indicatorYear, indicatorMonth }) {
  const { rows } = await query(
    `UPDATE forms SET title=COALESCE($2,title),description=COALESCE($3,description),
      start_date=COALESCE($4,start_date),end_date=COALESCE($5,end_date),
      innovation_center_id=COALESCE($6,innovation_center_id),indicator_year=COALESCE($7,indicator_year),
      indicator_month=COALESCE($8,indicator_month)
     WHERE id=$1 AND status='DRAFT' RETURNING id`,
    [id, title, description, startDate, endDate, innovationCenterId, indicatorYear, indicatorMonth],
  );
  return rows[0] ? findById(id) : null;
}

export async function setStatus(id, fromStatus, status) {
  const timestampColumn = status === 'ACTIVE' ? 'published_at'
    : status === 'CLOSED' ? 'closed_at' : 'archived_at';
  const { rows } = await query(
    `UPDATE forms SET status=$3,${timestampColumn}=NOW()
     WHERE id=$1 AND status=$2 RETURNING id`,
    [id, fromStatus, status],
  );
  return rows[0] ? findById(id) : null;
}

export async function setTargets(formId, organizationIds, client = { query }) {
  await client.query('DELETE FROM form_organizations WHERE form_id=$1', [formId]);
  for (const organizationId of organizationIds) {
    await client.query(
      `INSERT INTO form_organizations(form_id,organization_id)
       SELECT $1,id FROM organizations WHERE id=$2 AND status='ACTIVE'`,
      [formId, organizationId],
    );
  }
}

export async function setRespondents(formId, respondents, client = { query }) {
  await client.query('DELETE FROM form_respondents WHERE form_id=$1', [formId]);
  for (const respondent of respondents) {
    await client.query(
      `INSERT INTO form_respondents(form_id,user_id,organization_id)
       VALUES($1,$2,$3)`,
      [formId, respondent.id, respondent.organizationId],
    );
  }
}

export async function saveAudience(id, organizationIds, respondents) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(`SELECT status FROM forms WHERE id=$1 FOR UPDATE`, [id]);
    if (locked.rows[0]?.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      return null;
    }
    await setTargets(id, organizationIds, client);
    await setRespondents(id, respondents, client);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function publish(id, organizationIds, respondents) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(`SELECT status FROM forms WHERE id=$1 FOR UPDATE`, [id]);
    if (locked.rows[0]?.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      return null;
    }
    await setTargets(id, organizationIds, client);
    await setRespondents(id, respondents, client);
    await client.query(`UPDATE forms SET status='ACTIVE',published_at=NOW() WHERE id=$1`, [id]);
    await client.query('COMMIT');
    return findById(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function respondents(formId) {
  const { rows } = await query(
    `SELECT fr.id,fr.user_id,fr.organization_id,fr.status,fr.sent_at,fr.responded_at,fr.last_error,fr.created_at,
      u.name,u.email,u.role,u.status AS user_status,o.name AS organization_name
     FROM form_respondents fr
     JOIN users u ON u.id=fr.user_id
     JOIN organizations o ON o.id=fr.organization_id
     WHERE fr.form_id=$1 ORDER BY u.name`,
    [formId],
  );
  return rows;
}

export async function respondent(formId, userId) {
  const { rows } = await query(
    `SELECT fr.id,fr.form_id,fr.user_id,fr.organization_id,fr.status,u.name,u.email,o.name AS organization_name
     FROM form_respondents fr
     JOIN users u ON u.id=fr.user_id JOIN organizations o ON o.id=fr.organization_id
     WHERE fr.form_id=$1 AND fr.user_id=$2`,
    [formId, userId],
  );
  return rows[0];
}

export async function recordDelivery(formId, userId, { status, error = null }) {
  const { rows } = await query(
    `UPDATE form_respondents
     SET status=$3::varchar,sent_at=CASE WHEN $3::varchar='SENT' THEN NOW() ELSE sent_at END,last_error=$4
     WHERE form_id=$1 AND user_id=$2
     RETURNING id,status,sent_at,last_error`,
    [formId, userId, status, error],
  );
  return rows[0];
}

export async function markResponded(formId, userId) {
  await query(
    `UPDATE form_respondents SET status='RESPONDED',responded_at=NOW(),last_error=NULL
     WHERE form_id=$1 AND user_id=$2`,
    [formId, userId],
  );
}

export async function targets(formId) {
  const { rows } = await query(
    `SELECT o.id,o.name,o.cnpj FROM organizations o
     JOIN form_organizations fo ON fo.organization_id=o.id
     WHERE fo.form_id=$1 ORDER BY o.name`,
    [formId],
  );
  return rows;
}

export async function duplicate(id, createdBy) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const source = await findState(id, client);
    if (!source) {
      await client.query('ROLLBACK');
      return null;
    }
    const created = await client.query(
      `INSERT INTO forms(title,description,start_date,end_date,status,created_by,duplicated_from,innovation_center_id,indicator_year,indicator_month)
       SELECT title || ' (cópia)',description,start_date,end_date,'DRAFT',$2,id,innovation_center_id,indicator_year,indicator_month
       FROM forms WHERE id=$1 RETURNING id`,
      [id, createdBy],
    );
    const newId = created.rows[0].id;
    const originals = await client.query(
      `SELECT id,label,type,required,position
       FROM questions WHERE form_id=$1`,
      [id],
    );
    for (const original of originals.rows) {
      const copied = await client.query(
        `INSERT INTO questions(form_id,label,type,required,position)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [newId, original.label, original.type, original.required, original.position],
      );
      await client.query(
        `INSERT INTO question_options(question_id,value)
         SELECT $2,value FROM question_options WHERE question_id=$1 ORDER BY created_at`,
        [original.id, copied.rows[0].id],
      );
      await client.query(
        `INSERT INTO question_indicator_links(question_id,indicator_id,aggregation_type,periodicity,active)
         SELECT $2,indicator_id,aggregation_type,periodicity,active
         FROM question_indicator_links WHERE question_id=$1`,
        [original.id, copied.rows[0].id],
      );
    }
    await client.query(
      `INSERT INTO form_organizations(form_id,organization_id)
       SELECT $2,organization_id FROM form_organizations WHERE form_id=$1`,
      [id, newId],
    );
    await client.query('COMMIT');
    return findById(newId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function progress(id) {
  const { rows } = await query(
    `SELECT f.id,f.title,
      CASE WHEN COUNT(DISTINCT fo.organization_id)=0
        THEN (SELECT COUNT(*)::int FROM organizations WHERE status='ACTIVE')
        ELSE COUNT(DISTINCT fo.organization_id)::int END AS recipients,
      COUNT(DISTINCT r.organization_id) FILTER (WHERE r.status='SUBMITTED')::int AS submitted
     FROM forms f
     LEFT JOIN form_organizations fo ON fo.form_id=f.id
     LEFT JOIN responses r ON r.form_id=f.id
     WHERE f.id=$1 GROUP BY f.id`,
    [id],
  );
  return rows[0];
}

export async function questions(formId) {
  const { rows } = await query(
    `SELECT q.id,q.label,q.type,q.required,q.position,qil.indicator_id,
      d.code AS indicator_code,d.name AS indicator_name,d.category AS indicator_category,
      d.unit AS indicator_unit,d.value_type AS indicator_value_type,
      d.periodicity AS indicator_periodicity,d.aggregation_type AS indicator_aggregation
     FROM questions q
     LEFT JOIN question_indicator_links qil ON qil.question_id=q.id AND qil.active
     LEFT JOIN indicator_definitions d ON d.id=qil.indicator_id
     WHERE q.form_id=$1 ORDER BY q.position,q.created_at`,
    [formId],
  );
  return rows;
}

export async function indicatorDefinitions(category = null) {
  const { rows } = await query(
    `SELECT id,code,name,description,category,unit,value_type,periodicity,aggregation_type
     FROM indicator_definitions WHERE active AND calculation_type='MANUAL'
       AND ($1::text IS NULL OR category=$1) ORDER BY category,sort_order,name`,
    [category],
  );
  return rows;
}

export async function findDefinitionById(id) {
  const { rows } = await query(
    `SELECT id,code,name,category,unit,value_type,periodicity,aggregation_type,calculation_type,active
     FROM indicator_definitions WHERE id=$1`, [id],
  );
  return rows[0];
}

export async function indicatorAlreadyLinked(formId, indicatorId, exceptQuestionId = null) {
  const { rows } = await query(
    `SELECT EXISTS(SELECT 1 FROM questions q JOIN question_indicator_links qil ON qil.question_id=q.id AND qil.active
      WHERE q.form_id=$1 AND qil.indicator_id=$2 AND ($3::uuid IS NULL OR q.id<>$3)) AS linked`,
    [formId, indicatorId, exceptQuestionId],
  );
  return rows[0].linked;
}

export async function questionOptions(formId, questionId) {
  const { rows } = await query(
    `SELECT qo.id,qo.value FROM question_options qo
     JOIN questions q ON q.id=qo.question_id
     WHERE q.form_id=$1 AND q.id=$2 ORDER BY qo.created_at`,
    [formId, questionId],
  );
  return rows;
}

async function syncQuestionLink(client, questionId, indicatorId) {
  await client.query('DELETE FROM question_indicator_links WHERE question_id=$1', [questionId]);
  if (indicatorId) await client.query(
    `INSERT INTO question_indicator_links(question_id,indicator_id,aggregation_type,periodicity)
     SELECT $1,id,aggregation_type,periodicity FROM indicator_definitions
     WHERE id=$2 AND active AND calculation_type='MANUAL'`, [questionId, indicatorId],
  );
}

export async function addQuestion(formId, { label, type = 'TEXT', required = true, position, indicatorId = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO questions(form_id,label,type,required,position)
       SELECT id,$2,$3,$4,COALESCE($5,(SELECT COUNT(*) FROM questions WHERE form_id=$1))
       FROM forms WHERE id=$1 AND status='DRAFT' RETURNING *`,
      [formId, label, type, required, position],
    );
    if (rows[0]) await syncQuestionLink(client, rows[0].id, indicatorId);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function updateQuestion(formId, questionId, { label, type, required, position, indicatorId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE questions q SET label=COALESCE($3,label),type=COALESCE($4,type),
        required=COALESCE($5,required),position=COALESCE($6,position)
       FROM forms f WHERE q.id=$2 AND q.form_id=$1 AND f.id=q.form_id AND f.status='DRAFT'
       RETURNING q.*`,
      [formId, questionId, label, type, required, position],
    );
    if (rows[0] && indicatorId !== undefined) await syncQuestionLink(client, questionId, indicatorId || null);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function removeQuestion(formId, questionId) {
  const { rowCount } = await query(
    `DELETE FROM questions q USING forms f
     WHERE q.id=$2 AND q.form_id=$1 AND f.id=q.form_id AND f.status='DRAFT'`,
    [formId, questionId],
  );
  return rowCount > 0;
}

export async function addQuestionOption(formId, questionId, value) {
  const { rows } = await query(
    `INSERT INTO question_options(question_id,value)
     SELECT q.id,$3 FROM questions q JOIN forms f ON f.id=q.form_id
     WHERE q.form_id=$1 AND q.id=$2 AND q.type='OPTION' AND f.status='DRAFT' RETURNING question_options.*`,
    [formId, questionId, value],
  );
  return rows[0];
}
