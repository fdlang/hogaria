BEGIN;
CREATE TABLE IF NOT EXISTS blob_cleanup_jobs (
  storage_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + interval '30 minutes'),
  last_error TEXT
);
ALTER TABLE blob_cleanup_jobs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0);
ALTER TABLE blob_cleanup_jobs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE blob_cleanup_jobs ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE blob_cleanup_jobs ALTER COLUMN next_attempt_at SET DEFAULT (NOW() + interval '30 minutes');
UPDATE blob_cleanup_jobs SET next_attempt_at = GREATEST(next_attempt_at, created_at + interval '30 minutes') WHERE attempts = 0;
COMMIT;
