BEGIN;

-- An archived project is immutable, except for closing a shift that was already
-- open and recording the administrative decision on already submitted work.
CREATE OR REPLACE FUNCTION protect_archived_work_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE archived boolean;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'El historico laboral no puede vaciarse';
  END IF;
  SELECT NULLIF(payload->>'archivedAt', '') IS NOT NULL INTO archived
    FROM projects WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.project_id ELSE OLD.project_id END
    FOR SHARE;
  IF NOT COALESCE(archived, false) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'La obra esta archivada y su historico laboral no puede modificarse';
  END IF;
  IF OLD.status = 'abierto' AND NEW.status = 'enviado'
     AND OLD.started_at = NEW.started_at AND OLD.professional_id = NEW.professional_id
     AND OLD.project_id = NEW.project_id AND NEW.ended_at IS NOT NULL
     AND (NEW.payload->>'endedAt')::timestamptz = NEW.ended_at
     AND OLD.approved_cost_cents IS NOT DISTINCT FROM NEW.approved_cost_cents
     AND (NEW.payload - ARRAY['endedAt','pauses','notes','status','revision']::text[])
         = (OLD.payload - ARRAY['endedAt','pauses','notes','status','revision']::text[])
     AND (
       NEW.payload->'pauses' = OLD.payload->'pauses'
       OR (
         jsonb_array_length(COALESCE(NEW.payload->'pauses','[]'::jsonb)) = jsonb_array_length(COALESCE(OLD.payload->'pauses','[]'::jsonb))
         AND jsonb_array_length(COALESCE(OLD.payload->'pauses','[]'::jsonb)) > 0
         AND ((OLD.payload->'pauses')->(jsonb_array_length(OLD.payload->'pauses')-1)->>'endedAt') IS NULL
         AND ((NEW.payload->'pauses') - (jsonb_array_length(NEW.payload->'pauses')-1)) = ((OLD.payload->'pauses') - (jsonb_array_length(OLD.payload->'pauses')-1))
         AND (NEW.payload->'pauses')->(jsonb_array_length(NEW.payload->'pauses')-1)->>'startedAt' = (OLD.payload->'pauses')->(jsonb_array_length(OLD.payload->'pauses')-1)->>'startedAt'
         AND ((NEW.payload->'pauses')->(jsonb_array_length(NEW.payload->'pauses')-1)->>'endedAt')::timestamptz = NEW.ended_at
       )
     )
     AND NEW.payload->>'status' = 'enviado'
     AND NEW.seconds = GREATEST(0, floor(
       EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))
       - COALESCE((SELECT sum(EXTRACT(EPOCH FROM (
           (pause->>'endedAt')::timestamptz - (pause->>'startedAt')::timestamptz
         ))) FROM jsonb_array_elements(COALESCE(NEW.payload->'pauses', '[]'::jsonb)) pause), 0)
       - COALESCE((NEW.payload->>'breakSeconds')::integer, 0)
     ))::integer
     AND (NEW.payload->>'revision')::integer = (OLD.payload->>'revision')::integer + 1 THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'enviado' AND NEW.status IN ('aprobado', 'rechazado')
     AND OLD.started_at = NEW.started_at AND OLD.ended_at = NEW.ended_at
     AND OLD.seconds = NEW.seconds AND OLD.professional_id = NEW.professional_id
     AND OLD.project_id = NEW.project_id
     AND (NEW.payload - ARRAY['status','revision','approvedCostCents','approvedAt','approvedBy','reviewReason']::text[])
         = (OLD.payload - ARRAY['status','revision','approvedCostCents','approvedAt','approvedBy','reviewReason']::text[])
     AND NEW.payload->>'status' = NEW.status
     AND (NEW.payload->>'revision')::integer = (OLD.payload->>'revision')::integer + 1
     AND (
       (NEW.status = 'rechazado' AND NEW.approved_cost_cents IS NULL
        AND NEW.payload->>'approvedBy' IS NULL AND NEW.payload->>'approvedAt' IS NULL
        AND COALESCE(trim(NEW.payload->>'reviewReason'), '') <> '')
       OR
       (NEW.status = 'aprobado' AND NEW.approved_cost_cents IS NOT NULL
        AND (NEW.payload->>'approvedBy')::bigint > 0
        AND (NEW.payload->>'approvedAt')::timestamptz IS NOT NULL
        AND COALESCE(trim(NEW.payload->>'reviewReason'), '') = ''
        AND (NEW.payload->>'approvedCostCents')::bigint = NEW.approved_cost_cents
        AND NEW.approved_cost_cents = CASE
          WHEN NEW.payload->'rate'->>'rateUnit' = 'hora'
            THEN round(NEW.seconds::numeric / 3600 * (NEW.payload->'rate'->>'rateCents')::numeric)::bigint
          ELSE round(COALESCE((NEW.payload->>'units')::numeric, 0) * (NEW.payload->'rate'->>'rateCents')::numeric)::bigint
        END)
     ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La obra esta archivada; solo se permite cerrar y revisar trabajo pendiente';
END $$;

DROP TRIGGER IF EXISTS archived_work_entries_immutable ON work_entries;
CREATE TRIGGER archived_work_entries_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON work_entries
  FOR EACH ROW EXECUTE FUNCTION protect_archived_work_entry();

DROP TRIGGER IF EXISTS work_entries_no_truncate ON work_entries;
CREATE TRIGGER work_entries_no_truncate
  BEFORE TRUNCATE ON work_entries
  FOR EACH STATEMENT EXECUTE FUNCTION protect_archived_work_entry();

COMMIT;
