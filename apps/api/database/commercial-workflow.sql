BEGIN;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS decision jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS solicitud_id bigint REFERENCES solicitudes(id);
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_solicitud_unique ON opportunities(solicitud_id) WHERE solicitud_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS estimates_client_updated_idx ON estimates(cliente_id,updated_at DESC,id DESC);
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
