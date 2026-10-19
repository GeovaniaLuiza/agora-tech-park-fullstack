-- Response ownership is independent from the last writer (answered_by).
-- Nullable only to preserve historical rows whose ownership cannot be proven.
ALTER TABLE responses
  ADD COLUMN respondent_user_id UUID REFERENCES users(id) ON DELETE RESTRICT;

-- This metadata backfill must not rewrite the original update timestamp.
ALTER TABLE responses DISABLE TRIGGER update_responses_updated_at;
UPDATE responses r SET respondent_user_id=r.answered_by
WHERE EXISTS (
    SELECT 1 FROM audit_logs a WHERE a.entity='response' AND a.entity_id=r.id
      AND a.action IN ('RESPONSE_SUBMITTED','RESPONSE_DRAFT_SAVED') AND a.user_id=r.answered_by
  )
  AND NOT EXISTS (
    SELECT 1 FROM audit_logs a WHERE a.entity='response' AND a.entity_id=r.id
      AND a.action IN ('RESPONSE_SUBMITTED','RESPONSE_DRAFT_SAVED')
      AND a.user_id IS DISTINCT FROM r.answered_by
  )
  AND NOT EXISTS (
    SELECT 1 FROM form_respondents fr WHERE fr.form_id=r.form_id
      AND fr.organization_id=r.organization_id AND fr.user_id<>r.answered_by
  )
  AND (NOT EXISTS (SELECT 1 FROM form_respondents fr WHERE fr.form_id=r.form_id)
    OR EXISTS (SELECT 1 FROM form_respondents fr WHERE fr.form_id=r.form_id
      AND fr.organization_id=r.organization_id AND fr.user_id=r.answered_by));
ALTER TABLE responses ENABLE TRIGGER update_responses_updated_at;

-- NULL owners are retained for explicit review, never exposed as a resident's
-- own response, copied to another resident, or automatically claimed on write.
ALTER TABLE responses ADD CONSTRAINT responses_form_organization_respondent_key
  UNIQUE (form_id,organization_id,respondent_user_id);
ALTER TABLE responses DROP CONSTRAINT responses_form_id_organization_id_key;
CREATE INDEX idx_responses_respondent_history
  ON responses(respondent_user_id,organization_id,updated_at DESC);
COMMENT ON COLUMN responses.respondent_user_id IS
  'Response owner, distinct from answered_by (last writer, including drafts). NULL means unresolved historical ownership.';
