BEGIN;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0);

CREATE OR REPLACE FUNCTION protect_archived_change_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE project_payload jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id <> OLD.id OR NEW.project_id <> OLD.project_id OR
    NEW.numero IS DISTINCT FROM OLD.numero OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'La identidad de la orden de cambio es inmutable';
  END IF;
  SELECT payload INTO project_payload FROM projects
   WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.project_id ELSE OLD.project_id END
   FOR SHARE;
  IF NULLIF(project_payload->>'archivedAt', '') IS NOT NULL THEN
    RAISE EXCEPTION 'La obra esta archivada y sus ordenes de cambio son de solo lectura';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS archived_change_orders_immutable ON change_orders;
CREATE TRIGGER archived_change_orders_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON change_orders
  FOR EACH ROW EXECUTE FUNCTION protect_archived_change_order();

CREATE OR REPLACE FUNCTION protect_change_order_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'El historico de ordenes de cambio no puede vaciarse';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Una orden de cambio publicada forma parte del historico y no puede eliminarse';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS published_change_orders_immutable ON change_orders;
CREATE TRIGGER published_change_orders_immutable
  BEFORE DELETE ON change_orders
  FOR EACH ROW EXECUTE FUNCTION protect_change_order_history();

DROP TRIGGER IF EXISTS change_orders_no_truncate ON change_orders;
CREATE TRIGGER change_orders_no_truncate
  BEFORE TRUNCATE ON change_orders
  FOR EACH STATEMENT EXECUTE FUNCTION protect_change_order_history();
COMMIT;
