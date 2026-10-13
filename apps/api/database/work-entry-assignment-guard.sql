BEGIN;
CREATE OR REPLACE FUNCTION require_current_work_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  project_payload jsonb;
  professional_allowed boolean;
BEGIN
  -- Existing records remain actionable after unassignment so an open shift can
  -- be closed and submitted history can still be reviewed.
  IF EXISTS (SELECT 1 FROM work_entries WHERE id=NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT payload INTO project_payload
    FROM projects
   WHERE id=NEW.project_id
   FOR SHARE;
  IF project_payload IS NULL THEN
    RAISE EXCEPTION 'La obra no existe';
  END IF;
  IF NULLIF(project_payload->>'archivedAt','') IS NOT NULL
     OR project_payload->>'estado' <> 'en_curso' THEN
    RAISE EXCEPTION 'La obra no esta abierta para registrar trabajo';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(project_payload->'profesionalesAsignados','[]'::jsonb)) assignment
     WHERE (assignment->>'userId')::bigint=NEW.professional_id
  ) THEN
    RAISE EXCEPTION 'El profesional no esta asignado a la obra';
  END IF;

  SELECT activo AND rol='profesional' INTO professional_allowed
    FROM users
   WHERE id=NEW.professional_id
   FOR SHARE;
  IF COALESCE(professional_allowed,false)=false THEN
    RAISE EXCEPTION 'El profesional no esta activo';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS work_entry_assignment_guard ON work_entries;
CREATE TRIGGER work_entry_assignment_guard
  BEFORE INSERT ON work_entries
  FOR EACH ROW EXECUTE FUNCTION require_current_work_assignment();
COMMIT;
