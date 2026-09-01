CREATE TABLE IF NOT EXISTS indicator_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type VARCHAR(20) NOT NULL CHECK (import_type IN ('EVENTS','RESIDENTS')),
  file_name VARCHAR(255) NOT NULL,
  file_hash CHAR(64) NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  mime_type VARCHAR(120) NOT NULL,
  sheet_name VARCHAR(120) NOT NULL,
  innovation_center_id UUID NOT NULL REFERENCES innovation_centers(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  status VARCHAR(30) NOT NULL CHECK (status IN (
    'NOT_IMPORTED','PROCESSING','REVIEW_PENDING','WITH_WARNINGS','VALIDATED','IMPORTED','FAILED'
  )),
  total_records INTEGER NOT NULL DEFAULT 0 CHECK (total_records >= 0),
  total_imported INTEGER NOT NULL DEFAULT 0 CHECK (total_imported >= 0),
  total_ignored INTEGER NOT NULL DEFAULT 0 CHECK (total_ignored >= 0),
  total_warnings INTEGER NOT NULL DEFAULT 0 CHECK (total_warnings >= 0),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_indicator_import_batches_lookup
  ON indicator_import_batches(import_type,innovation_center_id,year,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_indicator_import_batches_hash
  ON indicator_import_batches(file_hash,import_type,innovation_center_id);
CREATE INDEX IF NOT EXISTS idx_indicator_import_batches_drafts
  ON indicator_import_batches(created_by,import_type,status,updated_at DESC)
  WHERE status IN ('REVIEW_PENDING','WITH_WARNINGS','VALIDATED');

ALTER TABLE indicator_records
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES indicator_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_rows INTEGER[];

CREATE INDEX IF NOT EXISTS idx_indicator_records_import_batch
  ON indicator_records(import_batch_id) WHERE import_batch_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_indicator_import_batches_updated_at ON indicator_import_batches;
CREATE TRIGGER update_indicator_import_batches_updated_at BEFORE UPDATE ON indicator_import_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
