-- Durable, role-aware in-app and email notifications.
-- Business changes and source events commit in the same transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS notification_event_outbox (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL,
  actor_id BIGINT,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  project_id BIGINT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','processed','failed')),
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notification_event_pending_idx
  ON notification_event_outbox(next_attempt_at, created_at) WHERE state IN ('pending','processing');

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES notification_event_outbox(id) ON DELETE CASCADE,
  recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('normal','high')),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  project_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  email_state TEXT NOT NULL DEFAULT 'pending' CHECK (email_state IN ('pending','sending','accepted','skipped','failed')),
  email_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (email_attempts >= 0),
  email_first_attempt_at TIMESTAMPTZ,
  email_next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_provider_id TEXT,
  email_failure_reason TEXT,
  UNIQUE(event_id, recipient_id, type)
);
CREATE INDEX IF NOT EXISTS user_notifications_recipient_idx
  ON user_notifications(recipient_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS user_notifications_unread_idx
  ON user_notifications(recipient_id, created_at DESC) WHERE read_at IS NULL AND expires_at IS NULL;
CREATE INDEX IF NOT EXISTS user_notifications_email_idx
  ON user_notifications(email_next_attempt_at, created_at) WHERE email_state IN ('pending','sending');

CREATE OR REPLACE FUNCTION hogaria_notification_actor() RETURNS BIGINT
LANGUAGE plpgsql STABLE AS $$
DECLARE raw_actor TEXT;
BEGIN
  raw_actor := current_setting('hogaria.actor_id', true);
  IF raw_actor IS NULL OR raw_actor = '' THEN RETURN NULL; END IF;
  RETURN raw_actor::BIGINT;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION enqueue_app_notification_event(
  event_kind TEXT, resource_kind TEXT, resource_key TEXT,
  project_key BIGINT DEFAULT NULL, event_payload JSONB DEFAULT '{}'::jsonb,
  event_actor BIGINT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_event_outbox(id,kind,actor_id,resource_type,resource_id,project_id,payload)
  VALUES(gen_random_uuid(),event_kind,COALESCE(event_actor,hogaria_notification_actor()),resource_kind,resource_key,project_key,COALESCE(event_payload,'{}'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION notify_request_submitted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM enqueue_app_notification_event('request_submitted','request',NEW.id::text,NULL,'{}'::jsonb,NULL);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION notify_estimate_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_kind TEXT;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  event_kind := CASE NEW.estado WHEN 'enviado' THEN 'estimate_published' WHEN 'firmado' THEN 'estimate_signed' WHEN 'rechazado' THEN 'estimate_rejected' END;
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

CREATE OR REPLACE FUNCTION notify_project_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM enqueue_app_notification_event('document_uploaded','file',NEW.id::text,NEW.project_id,
    jsonb_build_object('classification',COALESCE(NEW.payload->>'classification','reservado'),'uploadedBy',NEW.payload->>'uploadedBy'));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION notify_change_order_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_kind TEXT;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  event_kind := CASE WHEN NEW.estado='enviado' THEN 'change_order_sent' WHEN NEW.estado IN ('aprobado','rechazado') THEN 'change_order_decided' END;
  IF event_kind IS NOT NULL THEN PERFORM enqueue_app_notification_event(event_kind,'change_order',NEW.id::text,NEW.project_id); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION notify_work_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE action TEXT := NEW.payload->>'action'; event_kind TEXT;
BEGIN
  event_kind := CASE
    WHEN action IN ('salida','parte_enviado') THEN 'work_submitted'
    WHEN action IN ('aprobar','rechazar','corregir') THEN 'work_reviewed'
    WHEN action='tarifa_creada' THEN 'work_rate_changed'
  END;
  IF event_kind IS NOT NULL THEN
    PERFORM enqueue_app_notification_event(event_kind,'work_entry',COALESCE(NEW.entry_id::text,NEW.id::text),NULL,
      jsonb_build_object('professionalId',NEW.professional_id),NEW.actor_id);
  END IF;
  RETURN NEW;
END $$;

-- The durable multichannel pipeline replaces account-only triggers for new changes.
DROP TRIGGER IF EXISTS estimate_client_notice ON estimates;
DROP TRIGGER IF EXISTS project_client_notice ON projects;
DROP TRIGGER IF EXISTS document_client_notice ON project_files;
DROP TRIGGER IF EXISTS change_order_client_notice ON change_orders;
-- Keep solicitud_received_notice: it confirms receipt to an external lead.

DROP TRIGGER IF EXISTS app_request_notification ON solicitudes;
CREATE TRIGGER app_request_notification AFTER INSERT ON solicitudes FOR EACH ROW EXECUTE FUNCTION notify_request_submitted();
DROP TRIGGER IF EXISTS app_estimate_notification ON estimates;
CREATE TRIGGER app_estimate_notification AFTER UPDATE ON estimates FOR EACH ROW EXECUTE FUNCTION notify_estimate_state();
DROP TRIGGER IF EXISTS app_project_notification ON projects;
CREATE TRIGGER app_project_notification AFTER INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION notify_project_change();
DROP TRIGGER IF EXISTS app_file_notification ON project_files;
CREATE TRIGGER app_file_notification AFTER INSERT ON project_files FOR EACH ROW EXECUTE FUNCTION notify_project_file();
DROP TRIGGER IF EXISTS app_change_order_notification ON change_orders;
CREATE TRIGGER app_change_order_notification AFTER UPDATE ON change_orders FOR EACH ROW EXECUTE FUNCTION notify_change_order_state();
DROP TRIGGER IF EXISTS app_work_notification ON work_events;
CREATE TRIGGER app_work_notification AFTER INSERT ON work_events FOR EACH ROW EXECUTE FUNCTION notify_work_event();

COMMIT;
