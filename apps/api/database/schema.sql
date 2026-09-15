-- ReformaPro PostgreSQL schema. Apply with: npm run db:migrate --workspace @reformapro/api
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'cliente', 'profesional')),
  profesion TEXT,
  telefono TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL REFERENCES users(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS projects_cliente_id_idx ON projects(cliente_id);

CREATE TABLE IF NOT EXISTS budgets (
  id BIGSERIAL PRIMARY KEY,
  proyecto_id BIGINT NOT NULL REFERENCES projects(id),
  cliente_id BIGINT NOT NULL REFERENCES users(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS budgets_project_id_idx ON budgets(proyecto_id);
CREATE INDEX IF NOT EXISTS budgets_client_id_idx ON budgets(cliente_id);

CREATE TABLE IF NOT EXISTS signature_challenges (
  budget_id BIGINT PRIMARY KEY REFERENCES budgets(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  timestamp_ms BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id)
);

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
  ip INET,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_files (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_files_project_id_idx ON project_files(project_id);
