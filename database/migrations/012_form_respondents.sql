-- Assigns a form to specific eligible residents and records invitation delivery.
CREATE TABLE IF NOT EXISTS form_respondents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT form_respondents_status_check CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'RESPONDED')),
  CONSTRAINT form_respondents_form_user_unique UNIQUE (form_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_form_respondents_form_status
  ON form_respondents(form_id, status);
CREATE INDEX IF NOT EXISTS idx_form_respondents_user
  ON form_respondents(user_id, form_id);

DROP TRIGGER IF EXISTS update_form_respondents_updated_at ON form_respondents;
CREATE TRIGGER update_form_respondents_updated_at BEFORE UPDATE ON form_respondents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
