import { pool, query } from '../db/pool.js';

const columns = `u.id,u.name,u.email,u.role,u.status,u.requested_company_name,
  u.requested_company_cnpj,u.email_verified_at,u.created_at,u.approved_at,
  u.rejected_at,u.inactivated_at`;

export async function listPending() {
  const { rows } = await query(`SELECT ${columns},o.id AS existing_organization_id,o.name AS existing_organization_name
    FROM users u LEFT JOIN organizations o ON o.cnpj=u.requested_company_cnpj
    WHERE u.status='PENDING' AND u.email_verified_at IS NOT NULL ORDER BY u.created_at`);
  return rows;
}

export async function listUsers({ status = null, role = null } = {}) {
  const { rows } = await query(`SELECT ${columns},
    COALESCE(json_agg(json_build_object('id',o.id,'name',o.name,'cnpj',o.cnpj))
      FILTER (WHERE o.id IS NOT NULL AND uo.active),'[]') AS organizations
    FROM users u
    LEFT JOIN users_organizations uo ON uo.user_id=u.id
    LEFT JOIN organizations o ON o.id=uo.organization_id
    WHERE ($1::user_status IS NULL OR u.status=$1)
      AND ($2::user_role IS NULL OR u.role=$2)
    GROUP BY u.id ORDER BY u.created_at DESC`, [status, role]);
  return rows;
}

export async function findRequest(id, client = { query }) {
  const { rows } = await client.query(`SELECT ${columns} FROM users u WHERE u.id=$1`, [id]);
  return rows[0];
}

export async function approve({ userId, adminId, role, organizationId, organizationName, createOrganization }, audit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const request = await findRequest(userId, client);
    if (!request || request.status !== 'PENDING' || !request.email_verified_at) {
      await client.query('ROLLBACK');
      return null;
    }
    let resolvedOrganizationId = organizationId || null;
    if (role === 'RESIDENTE' && !resolvedOrganizationId && createOrganization) {
      const existing = await client.query('SELECT id FROM organizations WHERE cnpj=$1', [request.requested_company_cnpj]);
      if (existing.rows[0]) resolvedOrganizationId = existing.rows[0].id;
      else {
        const created = await client.query('INSERT INTO organizations(name,cnpj) VALUES($1,$2) RETURNING id',
          [organizationName || request.requested_company_name, request.requested_company_cnpj]);
        resolvedOrganizationId = created.rows[0].id;
      }
    }
    if (role === 'RESIDENTE' && !resolvedOrganizationId) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(`UPDATE users SET role=$2,status='ACTIVE',approved_by=$3,approved_at=NOW() WHERE id=$1`, [userId, role, adminId]);
    if (resolvedOrganizationId) {
      await client.query(`INSERT INTO users_organizations(user_id,organization_id,active,unlinked_at)
        VALUES($1,$2,TRUE,NULL)
        ON CONFLICT(user_id,organization_id) DO UPDATE SET active=TRUE,linked_at=NOW(),unlinked_at=NULL`, [userId, resolvedOrganizationId]);
    }
    await audit(client, { resolvedOrganizationId, previousRole: request.role });
    await client.query('COMMIT');
    return { userId, name: request.name, email: request.email, role, status: 'ACTIVE', organizationId: resolvedOrganizationId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function reject(userId, adminId, reason, audit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`UPDATE users
      SET status='REJECTED',rejected_by=$2,rejected_at=NOW(),rejection_reason=$3
      WHERE id=$1 AND status='PENDING' AND email_verified_at IS NOT NULL
      RETURNING id,name,email,role,status,rejected_at`, [userId, adminId, reason]);
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await audit(client);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function setStatus(userId, status, approvedBy = null) {
  const { rows } = await query(`UPDATE users SET status=$2::user_status,
    approved_by=CASE WHEN $2::user_status='ACTIVE' THEN COALESCE(approved_by,$3) ELSE approved_by END,
    approved_at=CASE WHEN $2::user_status='ACTIVE' THEN COALESCE(approved_at,NOW()) ELSE approved_at END,
    inactivated_at=CASE WHEN $2::user_status='INACTIVE' THEN NOW() WHEN $2::user_status='ACTIVE' THEN NULL ELSE inactivated_at END
    WHERE id=$1 RETURNING id,name,email,role,status`, [userId, status, approvedBy]);
  return rows[0];
}

export async function setRole(userId, role) {
  const { rows } = await query('UPDATE users SET role=$2 WHERE id=$1 RETURNING id,name,email,role,status', [userId, role]);
  return rows[0];
}

export async function linkOrganization(userId, organizationId) {
  await query(`INSERT INTO users_organizations(user_id,organization_id,active,unlinked_at)
    VALUES($1,$2,TRUE,NULL)
    ON CONFLICT(user_id,organization_id) DO UPDATE SET active=TRUE,linked_at=NOW(),unlinked_at=NULL`, [userId, organizationId]);
}

export async function unlinkOrganization(userId, organizationId) {
  const { rowCount } = await query(`UPDATE users_organizations SET active=FALSE,unlinked_at=NOW()
    WHERE user_id=$1 AND organization_id=$2 AND active`, [userId, organizationId]);
  return rowCount > 0;
}

export async function organizationExists(organizationId) {
  const { rowCount } = await query(`SELECT 1 FROM organizations WHERE id=$1 AND status='ACTIVE'`, [organizationId]);
  return rowCount > 0;
}

export async function userHasOrganization(userId) {
  const { rowCount } = await query('SELECT 1 FROM users_organizations WHERE user_id=$1 AND active', [userId]);
  return rowCount > 0;
}
