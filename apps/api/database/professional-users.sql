-- Repairs legacy duplicate identities and adds private personnel documents.
-- The canonical account is the active record, or otherwise the newest record.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT;
UPDATE users SET account_status = CASE
  WHEN activo THEN 'active'
  WHEN EXISTS (SELECT 1 FROM account_activation_tokens token WHERE token.user_id=users.id AND token.used_at IS NULL) THEN 'pending_activation'
  ELSE 'archived'
END WHERE account_status IS NULL;
ALTER TABLE users ALTER COLUMN account_status SET DEFAULT 'active';
ALTER TABLE users ALTER COLUMN account_status SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('pending_activation','active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TEMP TABLE duplicate_users ON COMMIT DROP AS
SELECT id
FROM (
  SELECT id, row_number() OVER (
    PARTITION BY lower(trim(email))
    ORDER BY activo DESC, created_at DESC, id DESC
  ) AS position
  FROM users
) ranked
WHERE position > 1;

DELETE FROM account_activation_tokens WHERE user_id IN (SELECT id FROM duplicate_users);
UPDATE users
SET activo = false,
    account_status = 'archived',
    session_version = session_version + 1,
    email = 'archived-duplicate-' || id || '@invalid.hogaria.local'
WHERE id IN (SELECT id FROM duplicate_users);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_case_insensitive_idx ON users(lower(trim(email)));

CREATE TABLE IF NOT EXISTS professional_documents (
  id BIGSERIAL PRIMARY KEY,
  professional_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS professional_documents_professional_idx ON professional_documents(professional_id, uploaded_at DESC);

COMMIT;
