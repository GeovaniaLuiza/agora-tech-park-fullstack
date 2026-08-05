import { query } from '../db/pool.js';

export async function createMany(userIds, notification) {
  const uniqueIds = [...new Set(userIds)];
  if (!uniqueIds.length) return [];
  const { rows } = await query(
    `INSERT INTO notifications(user_id,title,message,link)
     SELECT id,$2,$3,$4 FROM users
     WHERE id = ANY($1::uuid[]) AND status='ACTIVE'
     RETURNING id,user_id,title,message,link,read_at,created_at`,
    [uniqueIds, notification.title, notification.message, notification.link || null],
  );
  return rows;
}

export async function findForUser(userId, limit = 20) {
  const { rows } = await query(
    `SELECT id,title,message,link,read_at,created_at
     FROM notifications WHERE user_id=$1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

export async function markRead(id, userId) {
  const { rows } = await query(
    `UPDATE notifications SET read_at=COALESCE(read_at,NOW())
     WHERE id=$1 AND user_id=$2 RETURNING id,title,message,link,read_at,created_at`,
    [id, userId],
  );
  return rows[0];
}
