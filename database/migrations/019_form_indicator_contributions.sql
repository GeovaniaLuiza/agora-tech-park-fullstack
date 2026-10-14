-- No backfill: existing answers and published values are left untouched.
ALTER TABLE indicator_records DROP CONSTRAINT indicator_records_record_type_check;
ALTER TABLE indicator_records ADD CONSTRAINT indicator_records_record_type_check CHECK (
  record_type IN ('FUNCTION','PROGRAM','EVENT','MAINTAINER','IES','MUNICIPALITY','ENTITY',
    'LARGE_COMPANY','DEVELOPMENT_COMPANY','RESIDENT_COMPANY','OPEN_INNOVATION','FORM_RESPONSE')
);
ALTER TABLE indicator_records
  ADD COLUMN source_type VARCHAR(30) CHECK (source_type IS NULL OR source_type='FORM_RESPONSE'),
  ADD COLUMN response_id UUID REFERENCES responses(id) ON DELETE RESTRICT,
  ADD COLUMN question_id UUID REFERENCES questions(id) ON DELETE RESTRICT,
  ADD COLUMN indicator_id UUID REFERENCES indicator_definitions(id) ON DELETE RESTRICT,
  ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
  ADD COLUMN numeric_value NUMERIC(24,4),
  ADD CONSTRAINT indicator_records_form_contribution_complete CHECK (
    (record_type<>'FORM_RESPONSE' AND source_type IS NULL AND response_id IS NULL
      AND question_id IS NULL AND indicator_id IS NULL AND organization_id IS NULL AND numeric_value IS NULL)
    OR (record_type='FORM_RESPONSE' AND source_type IS NOT NULL AND source_type='FORM_RESPONSE' AND response_id IS NOT NULL
      AND question_id IS NOT NULL AND indicator_id IS NOT NULL AND organization_id IS NOT NULL
      AND numeric_value IS NOT NULL AND year IS NOT NULL AND month IS NOT NULL)
  );
CREATE UNIQUE INDEX idx_indicator_records_form_identity
  ON indicator_records(response_id,question_id,indicator_id) WHERE record_type='FORM_RESPONSE';
CREATE INDEX idx_indicator_records_form_aggregation
  ON indicator_records(innovation_center_id,indicator_id,year,month)
  WHERE record_type='FORM_RESPONSE' AND active AND deleted_at IS NULL;
