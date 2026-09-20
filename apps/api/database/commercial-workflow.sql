BEGIN;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS decision jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS solicitud_id bigint REFERENCES solicitudes(id);
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_solicitud_unique ON opportunities(solicitud_id) WHERE solicitud_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS estimates_client_updated_idx ON estimates(cliente_id,updated_at DESC,id DESC);
CREATE OR REPLACE FUNCTION protect_published_budget_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.enviado_at IS NOT NULL THEN
  RAISE EXCEPTION 'El histórico de una propuesta publicada no se puede eliminar';
 END IF;
 IF TG_OP='UPDATE' AND OLD.enviado_at IS NOT NULL THEN
  IF OLD.firmado_at IS NULL AND OLD.firma IS NULL AND NEW.firmado_at IS NOT NULL AND NEW.firma IS NOT NULL
     AND (to_jsonb(OLD)-'firma'-'firmado_at') IS NOT DISTINCT FROM (to_jsonb(NEW)-'firma'-'firmado_at') THEN
    RETURN NEW;
  END IF;
  IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
    RAISE EXCEPTION 'Una versión publicada es inmutable';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS budget_version_immutable ON budget_versions;
CREATE TRIGGER budget_version_immutable BEFORE UPDATE OR DELETE ON budget_versions FOR EACH ROW EXECUTE FUNCTION protect_published_budget_version();
CREATE OR REPLACE FUNCTION block_budget_version_truncate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'El histórico de propuestas no se puede truncar'; END $$;
DROP TRIGGER IF EXISTS budget_version_no_truncate ON budget_versions;
CREATE TRIGGER budget_version_no_truncate BEFORE TRUNCATE ON budget_versions FOR EACH STATEMENT EXECUTE FUNCTION block_budget_version_truncate();
CREATE OR REPLACE FUNCTION protect_published_change_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.estado<>'borrador' AND OLD.payload IS DISTINCT FROM NEW.payload THEN
  RAISE EXCEPTION 'Una orden publicada es inmutable';
 END IF;
 IF OLD.estado IS DISTINCT FROM NEW.estado AND NOT ((OLD.estado='borrador' AND NEW.estado='enviado') OR (OLD.estado='enviado' AND NEW.estado IN ('aprobado','rechazado'))) THEN
  RAISE EXCEPTION 'Transición de orden no permitida';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS change_order_immutable ON change_orders;
CREATE TRIGGER change_order_immutable BEFORE UPDATE ON change_orders FOR EACH ROW EXECUTE FUNCTION protect_published_change_order();
CREATE OR REPLACE FUNCTION protect_project_change_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM change_orders WHERE project_id=OLD.id AND estado<>'borrador') THEN
  RAISE EXCEPTION 'La obra tiene órdenes de cambio publicadas. Conserva su histórico.';
 END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS project_change_history ON projects;
CREATE TRIGGER project_change_history BEFORE DELETE ON projects FOR EACH ROW EXECUTE FUNCTION protect_project_change_history();
COMMIT;
