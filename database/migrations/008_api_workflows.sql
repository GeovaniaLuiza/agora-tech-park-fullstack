ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE users_organizations
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS unlinked_at TIMESTAMPTZ;

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duplicated_from UUID REFERENCES forms(id) ON DELETE SET NULL;

ALTER TABLE forms DROP CONSTRAINT IF EXISTS forms_status_check;
ALTER TABLE forms ADD CONSTRAINT forms_status_check
  CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'));

CREATE TABLE IF NOT EXISTS form_organizations (
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (form_id, organization_id)
);

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

ALTER TABLE responses
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE responses
SET status = 'SUBMITTED', submitted_at = COALESCE(submitted_at, created_at)
WHERE submitted_at IS NULL;

ALTER TABLE responses DROP CONSTRAINT IF EXISTS responses_status_check;
ALTER TABLE responses ADD CONSTRAINT responses_status_check
  CHECK (status IN ('DRAFT', 'SUBMITTED', 'REOPENED'));

CREATE INDEX IF NOT EXISTS idx_users_organizations_active
  ON users_organizations(user_id, organization_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_form_organizations_organization
  ON form_organizations(organization_id, form_id);
CREATE INDEX IF NOT EXISTS idx_forms_collection_status
  ON forms(status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_responses_status
  ON responses(status, organization_id, form_id);

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_forms_updated_at ON forms;
CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_responses_updated_at ON responses;
CREATE TRIGGER update_responses_updated_at BEFORE UPDATE ON responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
