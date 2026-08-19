import { pool, query } from '../db/pool.js';

const publicColumns = 'u.id,u.name,u.email,u.role,u.status,u.avatar_data,u.email_verified_at,u.approved_at,u.last_login_at,u.created_at';

export async function findByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email=$1', [email]);
  return rows[0];
}

export async function findById(id) {
  const { rows } = await query(`SELECT ${publicColumns} FROM users u WHERE u.id=$1`, [id]);
  return rows[0];
}

export async function findActiveAdminIds() {
  const { rows } = await query(
    "SELECT id FROM users WHERE role='ADMIN' AND status='ACTIVE'",
  );
  return rows.map(({ id }) => id);
}

export async function organizationsForUser(userId) {
  const { rows } = await query(`SELECT o.id,o.name,o.cnpj FROM organizations o
    JOIN users_organizations uo ON uo.organization_id=o.id
    WHERE uo.user_id=$1 AND uo.active AND o.status='ACTIVE' ORDER BY o.name`, [userId]);
  return rows;
}

export async function findPublicProfile(id) {
  const user = await findById(id);
  if (!user) return null;
  return { ...user, organizations: await organizationsForUser(id) };
}

export async function updateAvatar(userId, avatarData) {
  const { rows } = await query(
    `UPDATE users SET avatar_data=$2, updated_at=NOW() WHERE id=$1
     RETURNING id,name,email,role,status,avatar_data,email_verified_at,approved_at,last_login_at,created_at`,
    [userId, avatarData],
  );
  return rows[0];
}

export async function createPending({ name, email, passwordHash, cnpj, companyName }, audit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`INSERT INTO users
      (name,email,password_hash,status,requested_company_name,requested_company_cnpj,terms_accepted_at)
      VALUES($1,$2,$3,'EMAIL_PENDING',$4,$5,NOW())
      RETURNING id,name,email,role,status,created_at`,
    [name, email, passwordHash, companyName, cnpj]);
    const context = await audit(client, rows[0]);
    await client.query('COMMIT');
    return { ...rows[0], ...context };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function recordLogin(userId, audit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [userId]);
    await audit(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function findByOrganization(organizationId) {
  const { rows } = await query(`SELECT ${publicColumns} FROM users u
    JOIN users_organizations uo ON uo.user_id=u.id
    WHERE uo.organization_id=$1 AND uo.active`, [organizationId]);
  return rows;
}

export async function hasOrganization(userId, organizationId) {
  const { rowCount } = await query(
    `SELECT 1 FROM users_organizations uo JOIN organizations o ON o.id=uo.organization_id
     WHERE uo.user_id=$1 AND uo.organization_id=$2 AND uo.active AND o.status='ACTIVE'`,
    [userId, organizationId],
  );
  return rowCount > 0;
}

export async function findFormRecipients(organizationIds = [], emails = []) {
  const normalizedEmails = emails.map((email) => email.toLowerCase());
  const { rows } = await query(
    `SELECT DISTINCT u.id,u.name,u.email FROM users u
     WHERE u.status='ACTIVE' AND u.email_verified_at IS NOT NULL
       AND (
         LOWER(u.email) = ANY($2::text[])
         OR (u.role='RESIDENTE' AND EXISTS (
           SELECT 1 FROM users_organizations uo
           JOIN organizations o ON o.id=uo.organization_id
           WHERE uo.user_id=u.id AND uo.active AND o.status='ACTIVE'
             AND (cardinality($1::uuid[])=0 OR uo.organization_id=ANY($1::uuid[]))
         ))
       )
     ORDER BY u.name`,
    [organizationIds, normalizedEmails],
  );
  return rows;
}

export async function findEligibleFormRecipients({ organizationIds = [], userIds = [] } = {}) {
  const { rows } = await query(
    `SELECT u.id,u.name,u.email,
       json_agg(DISTINCT jsonb_build_object('id',o.id,'name',o.name) ORDER BY jsonb_build_object('id',o.id,'name',o.name)) AS organizations
     FROM users u
     JOIN users_organizations uo ON uo.user_id=u.id AND uo.active
     JOIN organizations o ON o.id=uo.organization_id AND o.status='ACTIVE'
     WHERE u.role='RESIDENTE' AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL
       AND (cardinality($1::uuid[])=0 OR o.id=ANY($1::uuid[]))
       AND (cardinality($2::uuid[])=0 OR u.id=ANY($2::uuid[]))
     GROUP BY u.id,u.name,u.email ORDER BY u.name`,
    [organizationIds, userIds],
  );
  return rows;
}
