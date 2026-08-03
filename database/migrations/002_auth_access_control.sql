DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_company_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS requested_company_cnpj VARCHAR(14),
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

ALTER TABLE users ALTER COLUMN status SET DEFAULT 'PENDING';

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ip_address INET;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_requested_cnpj ON users(requested_company_cnpj);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id);
