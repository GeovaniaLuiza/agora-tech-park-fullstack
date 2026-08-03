ALTER TABLE email_verification_tokens
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

CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_one_pending_delivery
  ON email_verification_tokens(user_id, purpose)
  WHERE delivery_status = 'PENDING' AND used_at IS NULL;
