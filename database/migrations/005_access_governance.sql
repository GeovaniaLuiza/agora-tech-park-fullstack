ALTER TABLE users
  ALTER COLUMN role DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS inactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

UPDATE users
SET role = NULL
WHERE status IN ('EMAIL_PENDING', 'PENDING');

ALTER TABLE email_verification_tokens
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(40) NOT NULL DEFAULT 'EMAIL_VERIFICATION',
  ADD COLUMN IF NOT EXISTS requested_ip INET;

CREATE INDEX IF NOT EXISTS idx_email_verification_user_purpose
  ON email_verification_tokens(user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_pending_review
  ON users(status, email_verified_at)
  WHERE status = 'PENDING';
