-- Deletion is distinct from a reversible INACTIVE status. Keep IDs and history.
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- Recover only exclusions positively identified by audit, without a subsequent
-- activation/inactivation. Ambiguous or missing audit never means deleted.
UPDATE users u SET deleted_at = d.deleted_at
FROM (
  SELECT entity_id, MAX(created_at) AS deleted_at
  FROM audit_logs WHERE entity='user' AND action='USER_DELETED'
  GROUP BY entity_id
) d
WHERE u.id=d.entity_id AND u.status='INACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM audit_logs a WHERE a.entity='user' AND a.entity_id=u.id
      AND a.action IN ('USER_ACTIVATED','USER_INACTIVATED') AND a.created_at >= d.deleted_at
  );

ALTER TABLE users ADD CONSTRAINT users_deleted_inactive_check
  CHECK (deleted_at IS NULL OR status='INACTIVE');

-- Install the replacement before removing absolute uniqueness, in the migration
-- transaction. Includes INACTIVE, PENDING, EMAIL_PENDING and REJECTED accounts.
CREATE UNIQUE INDEX idx_users_live_email_lower_unique ON users (LOWER(email)) WHERE deleted_at IS NULL;
ALTER TABLE users DROP CONSTRAINT users_email_key;
DROP INDEX idx_users_email_lower_unique;

UPDATE users_organizations uo SET active=FALSE,unlinked_at=COALESCE(unlinked_at,u.deleted_at)
FROM users u WHERE u.id=uo.user_id AND u.deleted_at IS NOT NULL AND uo.active;
UPDATE email_verification_tokens t SET used_at=COALESCE(t.used_at,u.deleted_at)
FROM users u WHERE u.id=t.user_id AND u.deleted_at IS NOT NULL AND t.used_at IS NULL;
UPDATE password_reset_tokens t SET used_at=COALESCE(t.used_at,u.deleted_at)
FROM users u WHERE u.id=t.user_id AND u.deleted_at IS NOT NULL AND t.used_at IS NULL;
