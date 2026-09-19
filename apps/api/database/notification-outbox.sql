-- Requires schema.sql and client-notifications.sql. Business writes and notices
-- commit together, including writes made outside the HTTP process.
BEGIN;
CREATE OR REPLACE FUNCTION enqueue_client_account_notice() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE recipient bigint; kind text; notice_id uuid := gen_random_uuid();
BEGIN
 IF TG_TABLE_NAME='estimates' THEN
  IF NEW.estado<>'enviado' OR OLD.estado=NEW.estado THEN RETURN NEW; END IF;
  recipient:=NEW.cliente_id; kind:='estimate';
 ELSIF TG_TABLE_NAME='project_files' THEN
  SELECT cliente_id INTO recipient FROM projects WHERE id=NEW.project_id;
  IF recipient=(NEW.payload->>'uploadedBy')::bigint THEN RETURN NEW; END IF;
  kind:='document';
 ELSE
  recipient:=NEW.cliente_id;
  IF TG_OP='INSERT' THEN kind:='project';
  ELSE
   IF ROW(NEW.payload->'estado',NEW.payload->'progreso',NEW.payload->'hitos',NEW.payload->'fechaInicio',NEW.payload->'fechaFinPrevista',NEW.payload->'nombre',NEW.payload->'descripcion',NEW.payload->'direccion',NEW.payload->'tipo',NEW.payload->'presupuesto') IS NOT DISTINCT FROM ROW(OLD.payload->'estado',OLD.payload->'progreso',OLD.payload->'hitos',OLD.payload->'fechaInicio',OLD.payload->'fechaFinPrevista',OLD.payload->'nombre',OLD.payload->'descripcion',OLD.payload->'direccion',OLD.payload->'tipo',OLD.payload->'presupuesto') THEN RETURN NEW; END IF;
   kind:='project-update';
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM users WHERE id=recipient AND activo AND rol='cliente') THEN
  INSERT INTO client_email_notifications(id,payload) VALUES(notice_id,
   jsonb_build_object('id',notice_id,'clientId',recipient,'kind',kind,'resourceId',NEW.id));
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS estimate_client_notice ON estimates;
CREATE TRIGGER estimate_client_notice AFTER UPDATE ON estimates FOR EACH ROW EXECUTE FUNCTION enqueue_client_account_notice();
DROP TRIGGER IF EXISTS project_client_notice ON projects;
CREATE TRIGGER project_client_notice AFTER INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION enqueue_client_account_notice();
DROP TRIGGER IF EXISTS document_client_notice ON project_files;
CREATE TRIGGER document_client_notice AFTER INSERT ON project_files FOR EACH ROW EXECUTE FUNCTION enqueue_client_account_notice();
COMMIT;
