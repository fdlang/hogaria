-- CLEAN DEVELOPMENT RESET — preserves users, solicitudes and audit_entries.
-- Run only when the replacement application code is deployed.
BEGIN;

DROP TABLE IF EXISTS project_files CASCADE;
DROP TABLE IF EXISTS signature_challenges CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS change_orders CASCADE;
DROP TABLE IF EXISTS budget_versions CASCADE;
DROP TABLE IF EXISTS estimates CASCADE;
DROP TABLE IF EXISTS opportunities CASCADE;

CREATE TABLE opportunities (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT REFERENCES users(id),
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  direccion TEXT NOT NULL,
  tipo TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL CHECK (estado IN ('nueva','contactada','visita_agendada','en_estudio','ganada','descartada')) DEFAULT 'nueva',
  fecha_visita TIMESTAMPTZ,
  notas_internas TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE estimates (
  id BIGSERIAL PRIMARY KEY,
  oportunidad_id BIGINT NOT NULL REFERENCES opportunities(id),
  cliente_id BIGINT NOT NULL REFERENCES users(id),
  numero TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('borrador','en_revision','enviado','aceptado','rechazado','caducado','sustituido')) DEFAULT 'borrador',
  version_actual INTEGER NOT NULL DEFAULT 1,
  borrador JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE budget_versions (
  id BIGSERIAL PRIMARY KEY,
  estimate_id BIGINT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  enviado_at TIMESTAMPTZ,
  firmado_at TIMESTAMPTZ,
  firma JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(estimate_id, version)
);

CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL REFERENCES users(id),
  estimate_id BIGINT NOT NULL UNIQUE REFERENCES estimates(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE change_orders (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('borrador','enviado','aprobado','rechazado')) DEFAULT 'borrador',
  payload JSONB NOT NULL,
  aprobado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, numero)
);

CREATE TABLE project_files (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX opportunities_estado_idx ON opportunities(estado);
CREATE INDEX estimates_oportunidad_idx ON estimates(oportunidad_id);
CREATE INDEX change_orders_project_idx ON change_orders(project_id);
CREATE INDEX project_files_project_id_idx ON project_files(project_id);
COMMIT;
