-- Administrative retirement preserves published, contractual and operational history.
BEGIN;

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_estado_check;
ALTER TABLE estimates ADD CONSTRAINT estimates_estado_check
  CHECK (estado IN ('borrador','en_revision','enviado','firmado','aceptado','rechazado','caducado','sustituido','anulado')) NOT VALID;
ALTER TABLE estimates VALIDATE CONSTRAINT estimates_estado_check;

CREATE OR REPLACE FUNCTION notify_estimate_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_kind TEXT;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  event_kind := CASE NEW.estado
    WHEN 'enviado' THEN 'estimate_published'
    WHEN 'firmado' THEN 'estimate_signed'
    WHEN 'rechazado' THEN 'estimate_rejected'
    WHEN 'anulado' THEN 'estimate_cancelled'
  END;
  IF event_kind IS NOT NULL THEN
    PERFORM enqueue_app_notification_event(event_kind,'estimate',NEW.id::text,NULL,jsonb_build_object('clientId',NEW.cliente_id));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION notify_project_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_ids BIGINT[] := ARRAY[]::BIGINT[]; new_ids BIGINT[] := ARRAY[]::BIGINT[]; added BIGINT[]; removed BIGINT[]; client_visible BOOLEAN := TRUE;
BEGIN
  SELECT COALESCE(array_agg((item->>'userId')::BIGINT),ARRAY[]::BIGINT[]) INTO new_ids
    FROM jsonb_array_elements(COALESCE(NEW.payload->'profesionalesAsignados','[]'::jsonb)) item;
  IF TG_OP = 'INSERT' THEN
    PERFORM enqueue_app_notification_event('project_created','project',NEW.id::text,NEW.id,jsonb_build_object('clientId',NEW.cliente_id,'professionalIds',to_jsonb(new_ids)));
    RETURN NEW;
  END IF;
  SELECT COALESCE(array_agg((item->>'userId')::BIGINT),ARRAY[]::BIGINT[]) INTO old_ids
    FROM jsonb_array_elements(COALESCE(OLD.payload->'profesionalesAsignados','[]'::jsonb)) item;
  IF COALESCE(OLD.payload->>'archivedAt','') = '' AND COALESCE(NEW.payload->>'archivedAt','') <> '' THEN
    PERFORM enqueue_app_notification_event('project_archived','project',NEW.id::text,NEW.id,
      jsonb_build_object('clientId',NEW.cliente_id,'professionalIds',to_jsonb(old_ids),'clientVisible',true));
    RETURN NEW;
  END IF;
  SELECT COALESCE(array_agg(value),ARRAY[]::BIGINT[]) INTO added FROM unnest(new_ids) value WHERE NOT value = ANY(old_ids);
  SELECT COALESCE(array_agg(value),ARRAY[]::BIGINT[]) INTO removed FROM unnest(old_ids) value WHERE NOT value = ANY(new_ids);
  client_visible := ROW(NEW.payload->'estado',NEW.payload->'progreso',NEW.payload->'hitos',NEW.payload->'fechaInicio',NEW.payload->'fechaFinPrevista',NEW.payload->'nombre',NEW.payload->'descripcion',NEW.payload->'direccion',NEW.payload->'tipo',NEW.payload->'presupuesto')
    IS DISTINCT FROM ROW(OLD.payload->'estado',OLD.payload->'progreso',OLD.payload->'hitos',OLD.payload->'fechaInicio',OLD.payload->'fechaFinPrevista',OLD.payload->'nombre',OLD.payload->'descripcion',OLD.payload->'direccion',OLD.payload->'tipo',OLD.payload->'presupuesto');
  IF client_visible OR added <> ARRAY[]::BIGINT[] OR removed <> ARRAY[]::BIGINT[] THEN
    PERFORM enqueue_app_notification_event('project_updated','project',NEW.id::text,NEW.id,
      jsonb_build_object('clientId',NEW.cliente_id,'clientVisible',client_visible,'professionalIds',to_jsonb(new_ids),'addedProfessionalIds',to_jsonb(added),'removedProfessionalIds',to_jsonb(removed)));
  END IF;
  RETURN NEW;
END $$;

COMMIT;
