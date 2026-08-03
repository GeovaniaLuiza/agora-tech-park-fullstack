import { query } from '../db/pool.js';

const columns = 'id,name,cnpj,status,created_at,updated_at';
export async function findAll({ includeInactive = false } = {}) {
  const { rows } = await query(
    `SELECT ${columns} FROM organizations
     WHERE ($1::boolean OR status='ACTIVE') ORDER BY name`,
    [includeInactive],
  );
  return rows;
}
export async function findForUser(userId) {
  const { rows } = await query(
    `SELECT o.${columns.replaceAll(',', ',o.')} FROM organizations o
     JOIN users_organizations uo ON uo.organization_id=o.id
     WHERE uo.user_id=$1 AND uo.active AND o.status='ACTIVE' ORDER BY o.name`,
    [userId],
  );
  return rows;
}
export async function userHasOrganization(userId, organizationId) {
  const { rowCount } = await query(
    `SELECT 1 FROM users_organizations uo JOIN organizations o ON o.id=uo.organization_id
     WHERE uo.user_id=$1 AND uo.organization_id=$2 AND uo.active AND o.status='ACTIVE'`,
    [userId, organizationId],
  );
  return rowCount > 0;
}
export async function findById(id) {
  const { rows } = await query(`SELECT ${columns} FROM organizations WHERE id=$1`, [id]);
  return rows[0];
}
export async function existsActive(id) {
  const { rowCount } = await query(`SELECT 1 FROM organizations WHERE id=$1 AND status='ACTIVE'`, [id]);
  return rowCount > 0;
}
export async function create({ name, cnpj }) {
  const { rows } = await query(
    `INSERT INTO organizations(name,cnpj) VALUES($1,$2) RETURNING id`,
    [name, cnpj || null],
  );
  return findById(rows[0].id);
}
export async function update(id, { name, cnpj, status }) {
  const { rows } = await query(
    `UPDATE organizations SET name=COALESCE($2,name),cnpj=COALESCE($3,cnpj),
      status=COALESCE($4,status) WHERE id=$1 RETURNING id`,
    [id, name, cnpj, status],
  );
  return rows[0] ? findById(id) : null;
}
export async function inactivate(id) {
  const { rows } = await query(
    `UPDATE organizations SET status='INACTIVE' WHERE id=$1 AND status='ACTIVE' RETURNING id`,
    [id],
  );
  return Boolean(rows[0]);
}
