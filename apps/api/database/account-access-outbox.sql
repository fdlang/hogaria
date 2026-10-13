BEGIN;
CREATE TABLE IF NOT EXISTS account_access_outbox (
  id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE REFERENCES account_activation_tokens(token_hash) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  first_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS account_access_outbox_pending_idx
  ON account_access_outbox(next_attempt_at,created_at)
  WHERE state IN ('pending','sending');
COMMIT;
