\set ON_ERROR_STOP on

-- This script is intentionally repeatable. Docker's init directory only runs for
-- a brand-new volume, while this project is often upgraded with an existing one.
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('EMAIL_PENDING', 'PENDING', 'ACTIVE', 'REJECTED', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'EMAIL_PENDING' BEFORE 'PENDING';

ALTER TABLE users
  ALTER COLUMN role DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'EMAIL_PENDING',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_company_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS requested_company_cnpj VARCHAR(14),
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS inactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

ALTER TABLE users ALTER COLUMN status SET DEFAULT 'EMAIL_PENDING';

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ip_address INET;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purpose VARCHAR(40) NOT NULL DEFAULT 'EMAIL_VERIFICATION',
  requested_ip INET,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
);

ALTER TABLE email_verification_tokens
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(40) NOT NULL DEFAULT 'EMAIL_VERIFICATION',
  ADD COLUMN IF NOT EXISTS requested_ip INET,
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20);

UPDATE email_verification_tokens
SET delivery_status = 'DELIVERED'
WHERE delivery_status IS NULL;

ALTER TABLE email_verification_tokens
  ALTER COLUMN delivery_status SET DEFAULT 'PENDING',
  ALTER COLUMN delivery_status SET NOT NULL;

ALTER TABLE email_verification_tokens
  DROP CONSTRAINT IF EXISTS email_verification_tokens_delivery_status_check;
ALTER TABLE email_verification_tokens
  ADD CONSTRAINT email_verification_tokens_delivery_status_check
  CHECK (delivery_status IN ('PENDING', 'DELIVERED', 'FAILED'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON users ((LOWER(email)));
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_requested_cnpj ON users(requested_company_cnpj);
CREATE INDEX IF NOT EXISTS idx_users_pending_review
  ON users(status, email_verified_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_email_verification_user
  ON email_verification_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_verification_hash
  ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verification_user_purpose
  ON email_verification_tokens(user_id, purpose, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_one_pending_delivery
  ON email_verification_tokens(user_id, purpose)
  WHERE delivery_status = 'PENDING' AND used_at IS NULL;
