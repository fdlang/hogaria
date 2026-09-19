BEGIN;
-- Do not silently abandon records from the earlier, unwired prototype.
DO $$ DECLARE legacy_data BOOLEAN; BEGIN
 IF to_regclass('public.work_sessions') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM work_sessions)' INTO legacy_data;
  IF legacy_data THEN RAISE EXCEPTION 'work_sessions contains legacy records: migrate and reconcile them before enabling work tracking'; END IF;
 END IF;
END; $$;
-- Append-only tariffs and audit; financial history must survive account/project archival.
CREATE TABLE IF NOT EXISTS work_rates (
 id UUID PRIMARY KEY, professional_id BIGINT NOT NULL REFERENCES users(id),
 effective_at TIMESTAMPTZ NOT NULL, payload JSONB NOT NULL,
 UNIQUE(professional_id,effective_at)
);
CREATE TABLE IF NOT EXISTS work_entries (
 id UUID PRIMARY KEY, professional_id BIGINT NOT NULL REFERENCES users(id),
 project_id BIGINT NOT NULL REFERENCES projects(id),
 started_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ,
 status TEXT NOT NULL CHECK(status IN ('abierto','enviado','aprobado','rechazado')),
 seconds BIGINT NOT NULL CHECK(seconds>=0), approved_cost_cents BIGINT CHECK(approved_cost_cents>=0),
 payload JSONB NOT NULL,
 CHECK(ended_at IS NULL OR ended_at>started_at),
 CHECK((status='abierto')=(ended_at IS NULL)),
 CHECK((status='aprobado')=(approved_cost_cents IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS work_one_open ON work_entries(professional_id) WHERE status='abierto';
CREATE INDEX IF NOT EXISTS work_by_professional ON work_entries(professional_id,started_at DESC);
CREATE INDEX IF NOT EXISTS work_by_project ON work_entries(project_id,status,started_at DESC);
CREATE INDEX IF NOT EXISTS work_by_date ON work_entries(started_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS work_events (
 sequence BIGSERIAL UNIQUE, id UUID PRIMARY KEY,
 professional_id BIGINT NOT NULL REFERENCES users(id), entry_id UUID REFERENCES work_entries(id),
 actor_id BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL, payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS work_event_entry ON work_events(entry_id,sequence);
CREATE TABLE IF NOT EXISTS work_budgets (project_id BIGINT PRIMARY KEY REFERENCES projects(id),payload JSONB NOT NULL);
CREATE OR REPLACE FUNCTION protect_work_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Work history is append-only'; END; $$;
DROP TRIGGER IF EXISTS immutable_work_rates ON work_rates;
CREATE TRIGGER immutable_work_rates BEFORE UPDATE OR DELETE ON work_rates FOR EACH ROW EXECUTE FUNCTION protect_work_history();
DROP TRIGGER IF EXISTS immutable_work_events ON work_events;
CREATE TRIGGER immutable_work_events BEFORE UPDATE OR DELETE ON work_events FOR EACH ROW EXECUTE FUNCTION protect_work_history();
COMMIT;
