CREATE TABLE IF NOT EXISTS client_email_notifications (
 id uuid PRIMARY KEY,
 payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','accepted','skipped','failed')),
 attempts integer NOT NULL DEFAULT 0,
 provider_id text,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE client_email_notifications ADD COLUMN IF NOT EXISTS first_attempt_at timestamptz;
ALTER TABLE client_email_notifications ADD COLUMN IF NOT EXISTS failure_reason text;
-- Conservative backfill: never restart the idempotency window for old attempts.
UPDATE client_email_notifications SET first_attempt_at=created_at
 WHERE attempts>0 AND first_attempt_at IS NULL;
CREATE INDEX IF NOT EXISTS client_email_notifications_pending
 ON client_email_notifications(next_attempt_at) WHERE state IN ('pending','sending');
