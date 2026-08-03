import { pool, query } from '../db/pool.js';

const projection = `SELECT f.id,f.title,f.description,f.status,f.start_date,f.end_date,
  f.created_by,f.created_at,f.updated_at,f.published_at,f.closed_at,f.archived_at,
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
    `SELECT id,title,status,start_date,end_date,created_by FROM forms WHERE id=$1`,
    [id],
  );
  return rows[0];
}

export async function create({ title, description = '', startDate, endDate, createdBy }) {
  const { rows } = await query(
    `INSERT INTO forms(title,description,start_date,end_date,created_by)
     VALUES($1,$2,$3,$4,$5) RETURNING id`,
    [title, description, startDate || null, endDate || null, createdBy],
  );
  return findById(rows[0].id);
}

export async function update(id, { title, description, startDate, endDate }) {
  const { rows } = await query(
    `UPDATE forms SET title=COALESCE($2,title),description=COALESCE($3,description),
      start_date=COALESCE($4,start_date),end_date=COALESCE($5,end_date)
     WHERE id=$1 AND status='DRAFT' RETURNING id`,
    [id, title, description, startDate, endDate],
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

export async function publish(id, organizationIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(`SELECT status FROM forms WHERE id=$1 FOR UPDATE`, [id]);
    if (locked.rows[0]?.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      return null;
    }
    await setTargets(id, organizationIds, client);
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
      `INSERT INTO forms(title,description,start_date,end_date,status,created_by,duplicated_from)
       SELECT title || ' (cópia)',description,start_date,end_date,'DRAFT',$2,id
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
    'SELECT id,label,type,required,position FROM questions WHERE form_id=$1 ORDER BY position,created_at',
    [formId],
  );
  return rows;
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

export async function addQuestion(formId, { label, type = 'TEXT', required = true, position }) {
  const { rows } = await query(
    `INSERT INTO questions(form_id,label,type,required,position)
     SELECT id,$2,$3,$4,COALESCE($5,(SELECT COUNT(*) FROM questions WHERE form_id=$1))
     FROM forms WHERE id=$1 AND status='DRAFT' RETURNING *`,
    [formId, label, type, required, position],
  );
  return rows[0];
}

export async function updateQuestion(formId, questionId, { label, type, required, position }) {
  const { rows } = await query(
    `UPDATE questions q SET label=COALESCE($3,label),type=COALESCE($4,type),
      required=COALESCE($5,required),position=COALESCE($6,position)
     FROM forms f WHERE q.id=$2 AND q.form_id=$1 AND f.id=q.form_id AND f.status='DRAFT'
     RETURNING q.*`,
    [formId, questionId, label, type, required, position],
  );
  return rows[0];
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
