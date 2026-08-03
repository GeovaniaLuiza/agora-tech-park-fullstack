ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'EMAIL_PENDING' BEFORE 'PENDING';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE status IN ('ACTIVE', 'INACTIVE', 'REJECTED');

UPDATE users
SET status = 'EMAIL_PENDING'
WHERE status = 'PENDING' AND email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_user
  ON email_verification_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_verification_hash
  ON email_verification_tokens(token_hash);
