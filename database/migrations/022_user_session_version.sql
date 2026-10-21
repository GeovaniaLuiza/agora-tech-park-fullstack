-- A monotonic account generation revokes JWTs across API instances and restarts.
-- Legacy JWTs without sv belong to generation zero until logout/password reset.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0
  CHECK (session_version >= 0);
