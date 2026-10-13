-- Preserve every batch and its status. Only the newest generation can be resumed.
ALTER TABLE indicator_import_batches
  ADD COLUMN is_current BOOLEAN NOT NULL DEFAULT FALSE;

WITH latest AS (
  SELECT DISTINCT ON (innovation_center_id, import_type) id
  FROM indicator_import_batches
  ORDER BY innovation_center_id, import_type, created_at DESC, updated_at DESC, id DESC
)
UPDATE indicator_import_batches b SET is_current=TRUE
FROM latest WHERE b.id=latest.id;

CREATE UNIQUE INDEX idx_indicator_import_batches_current
  ON indicator_import_batches(innovation_center_id, import_type) WHERE is_current;

ALTER TABLE indicator_import_batches
  DROP CONSTRAINT indicator_import_batches_status_check;
ALTER TABLE indicator_import_batches
  ADD CONSTRAINT indicator_import_batches_status_check CHECK (status IN (
    'NOT_IMPORTED','PROCESSING','REVIEW_PENDING','WITH_WARNINGS','VALIDATED','IMPORTED','FAILED','CANCELLED'
  ));
