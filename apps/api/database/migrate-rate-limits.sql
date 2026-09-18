BEGIN;

CREATE TABLE IF NOT EXISTS rate_limit_windows (
  key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL CHECK (hits > 0)
);

CREATE INDEX IF NOT EXISTS rate_limit_windows_started_idx
  ON rate_limit_windows(window_started_at);

COMMIT;
