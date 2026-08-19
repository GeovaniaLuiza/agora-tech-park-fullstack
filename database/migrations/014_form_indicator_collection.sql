ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS innovation_center_id UUID REFERENCES innovation_centers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS indicator_year INTEGER CHECK (indicator_year BETWEEN 2000 AND 2200),
  ADD COLUMN IF NOT EXISTS indicator_month SMALLINT CHECK (indicator_month BETWEEN 1 AND 12);

ALTER TABLE forms DROP CONSTRAINT IF EXISTS forms_indicator_period_complete;
ALTER TABLE forms ADD CONSTRAINT forms_indicator_period_complete CHECK (
  (indicator_year IS NULL AND indicator_month IS NULL AND innovation_center_id IS NULL)
  OR (indicator_year IS NOT NULL AND indicator_month IS NOT NULL AND innovation_center_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_question_indicator_links_indicator
  ON question_indicator_links(indicator_id) WHERE active;

CREATE INDEX IF NOT EXISTS idx_indicator_values_source
  ON indicator_values(source_type, source_id) WHERE deleted_at IS NULL;
