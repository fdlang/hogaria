BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tipo_vinculacion TEXT,
  ADD COLUMN IF NOT EXISTS coste_hora NUMERIC(12,2);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tipo_vinculacion_check;
ALTER TABLE users ADD CONSTRAINT users_tipo_vinculacion_check
  CHECK (tipo_vinculacion IS NULL OR tipo_vinculacion IN ('empleado','autonomo','subcontrata'));
ALTER TABLE users ADD CONSTRAINT users_coste_hora_check
  CHECK (coste_hora IS NULL OR coste_hora >= 0);

CREATE TABLE IF NOT EXISTS work_sessions (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  professional_id BIGINT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('jornada','parte')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  units NUMERIC(12,2),
  unit_label TEXT,
  cost_rate NUMERIC(12,2) NOT NULL CHECK (cost_rate >= 0),
  rate_unit TEXT NOT NULL CHECK (rate_unit IN ('hora','jornada','unidad')),
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto','enviado','aprobado','rechazado')),
  approved_by BIGINT REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS work_sessions_project_idx ON work_sessions(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS work_sessions_professional_idx ON work_sessions(professional_id, started_at DESC);

COMMIT;
