ALTER TABLE indicators
  ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'FAPESC_SCTI';

UPDATE indicators SET source = 'FAPESC_SCTI' WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_indicators_source_period
  ON indicators(source, period);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
