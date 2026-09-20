-- Canonical schema for a new ReformaPro database.
-- Safe to run repeatedly; it never drops operational or historical data.

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'cliente', 'profesional')),
  profesion TEXT,
  telefono TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('pending_activation','active','archived')),
  session_version INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS opportunities (
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
CREATE INDEX IF NOT EXISTS opportunities_estado_idx ON opportunities(estado);

CREATE TABLE IF NOT EXISTS estimates (
  id BIGSERIAL PRIMARY KEY,
  oportunidad_id BIGINT NOT NULL REFERENCES opportunities(id),
  cliente_id BIGINT NOT NULL REFERENCES users(id),
  numero TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('borrador','en_revision','enviado','firmado','aceptado','rechazado','caducado','sustituido')) DEFAULT 'borrador',
  version_actual INTEGER NOT NULL DEFAULT 1,
  borrador JSONB NOT NULL DEFAULT '{}'::jsonb,
  motivo_rechazo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS estimates_oportunidad_idx ON estimates(oportunidad_id);

-- Name retained for compatibility with the production migration history.
CREATE TABLE IF NOT EXISTS budget_versions (
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

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL REFERENCES users(id),
  estimate_id BIGINT NOT NULL UNIQUE REFERENCES estimates(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS projects_cliente_id_idx ON projects(cliente_id);

CREATE TABLE IF NOT EXISTS change_orders (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('borrador','enviado','aprobado','rechazado')) DEFAULT 'borrador',
  payload JSONB NOT NULL,
  aprobado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, numero)
);
CREATE INDEX IF NOT EXISTS change_orders_project_idx ON change_orders(project_id);

CREATE TABLE IF NOT EXISTS project_files (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_files_project_id_idx ON project_files(project_id);

CREATE TABLE IF NOT EXISTS professional_documents (
  id BIGSERIAL PRIMARY KEY,
  professional_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS professional_documents_professional_idx ON professional_documents(professional_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS catalog_items (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  sale_price NUMERIC(12, 2) NOT NULL CHECK (sale_price >= 0),
  vat_rate SMALLINT NOT NULL DEFAULT 21 CHECK (vat_rate BETWEEN 0 AND 100),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS catalog_items_category_active_idx ON catalog_items(category, active, reference);

CREATE TABLE IF NOT EXISTS account_activation_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS account_activation_tokens_user_idx ON account_activation_tokens(user_id);

CREATE TABLE IF NOT EXISTS audit_entries (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_entries_timestamp_idx ON audit_entries(timestamp DESC);

CREATE TABLE IF NOT EXISTS solicitudes (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  motivo TEXT,
  ip INET,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
