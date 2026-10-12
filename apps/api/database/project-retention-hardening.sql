BEGIN;

-- Projects are aggregate roots for contractual, documentary and labour history.
-- Operational retirement is represented by archivedAt; physical deletion is forbidden.
CREATE OR REPLACE FUNCTION protect_project_change_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La obra forma parte del histórico y no puede eliminarse';
END $$;

DROP TRIGGER IF EXISTS project_change_history ON projects;
CREATE TRIGGER project_change_history
  BEFORE DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION protect_project_change_history();

CREATE OR REPLACE FUNCTION protect_project_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El histórico de obras no puede vaciarse';
END $$;

DROP TRIGGER IF EXISTS project_history_no_truncate ON projects;
CREATE TRIGGER project_history_no_truncate
  BEFORE TRUNCATE ON projects
  FOR EACH STATEMENT EXECUTE FUNCTION protect_project_truncate();

CREATE OR REPLACE FUNCTION protect_archived_project_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NULLIF(OLD.payload->>'archivedAt', '') IS NOT NULL
     AND NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'La obra esta archivada y su historico no puede modificarse';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS archived_project_immutable ON projects;
CREATE TRIGGER archived_project_immutable
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION protect_archived_project_update();

CREATE OR REPLACE FUNCTION protect_archived_project_resource() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_project_id bigint;
  target_project_payload jsonb;
BEGIN
  target_project_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.project_id ELSE NEW.project_id END;
  SELECT payload
    INTO target_project_payload
    FROM projects
   WHERE id = target_project_id
   FOR UPDATE;
  IF NULLIF(target_project_payload->>'archivedAt', '') IS NOT NULL THEN
    RAISE EXCEPTION 'La obra esta archivada y su historico no puede modificarse';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS archived_project_files_immutable ON project_files;
CREATE TRIGGER archived_project_files_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON project_files
  FOR EACH ROW EXECUTE FUNCTION protect_archived_project_resource();

DROP TRIGGER IF EXISTS archived_work_budgets_immutable ON work_budgets;
CREATE TRIGGER archived_work_budgets_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON work_budgets
  FOR EACH ROW EXECUTE FUNCTION protect_archived_project_resource();

CREATE OR REPLACE FUNCTION protect_project_resource_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El historico documental y laboral de las obras no puede vaciarse';
END $$;

DROP TRIGGER IF EXISTS project_files_no_truncate ON project_files;
CREATE TRIGGER project_files_no_truncate
  BEFORE TRUNCATE ON project_files
  FOR EACH STATEMENT EXECUTE FUNCTION protect_project_resource_truncate();

DROP TRIGGER IF EXISTS work_budgets_no_truncate ON work_budgets;
CREATE TRIGGER work_budgets_no_truncate
  BEFORE TRUNCATE ON work_budgets
  FOR EACH STATEMENT EXECUTE FUNCTION protect_project_resource_truncate();

CREATE OR REPLACE FUNCTION prevent_archive_with_pending_file_deletions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NULLIF(OLD.payload->>'archivedAt', '') IS NULL
     AND NULLIF(NEW.payload->>'archivedAt', '') IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM project_files
        WHERE project_id = NEW.id
          AND payload->>'deleting' = 'true'
     ) THEN
    RAISE EXCEPTION 'La obra tiene eliminaciones de archivos pendientes';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS project_archive_pending_file_guard ON projects;
CREATE TRIGGER project_archive_pending_file_guard
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION prevent_archive_with_pending_file_deletions();

COMMIT;
