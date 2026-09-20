BEGIN;
CREATE OR REPLACE FUNCTION protect_audit_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'El histórico de auditoría es inmutable';
END $$;
DROP TRIGGER IF EXISTS audit_history_immutable ON audit_entries;
CREATE TRIGGER audit_history_immutable BEFORE UPDATE OR DELETE ON audit_entries FOR EACH ROW EXECUTE FUNCTION protect_audit_history();
DROP TRIGGER IF EXISTS audit_history_no_truncate ON audit_entries;
CREATE TRIGGER audit_history_no_truncate BEFORE TRUNCATE ON audit_entries FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_history();
-- Minimal technical journal: no passwords, tokens, documents or customer text.
-- Runs in the business transaction; a failed audit insert rolls back the write.
CREATE OR REPLACE FUNCTION audit_business_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry_id text := gen_random_uuid()::text; row_id text; changed jsonb := '[]'::jsonb;
 actor_id bigint := coalesce(nullif(current_setting('hogaria.actor_id',true),''),'0')::bigint;
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(OLD) IS NOT DISTINCT FROM to_jsonb(NEW) THEN RETURN NEW; END IF;
 row_id := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD)->>'id' ELSE to_jsonb(NEW)->>'id' END;
 IF TG_OP='UPDATE' THEN
  SELECT coalesce(jsonb_agg(key ORDER BY key),'[]'::jsonb) INTO changed
  FROM jsonb_each(to_jsonb(NEW)) n WHERE n.value IS DISTINCT FROM to_jsonb(OLD)->n.key;
 END IF;
 INSERT INTO audit_entries(id,payload,timestamp) VALUES(entry_id,
  jsonb_build_object('id',entry_id,'action','DB_'||upper(TG_TABLE_NAME)||'_'||TG_OP,
   'userId',actor_id,'userName',coalesce((SELECT nombre FROM users WHERE id=actor_id),'Sistema'),'timestamp',clock_timestamp(),
   'ip',coalesce(nullif(current_setting('hogaria.ip',true),''),'internal'),'userAgent',coalesce(nullif(current_setting('hogaria.user_agent',true),''),'database'),
   'details',jsonb_build_object('table',TG_TABLE_NAME,'recordId',row_id,'operation',TG_OP,'changedFields',changed)),clock_timestamp());
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['users','projects','opportunities','estimates','budget_versions','change_orders','catalog_items','solicitudes','project_files'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS durable_business_audit ON %I',target);
  EXECUTE format('CREATE TRIGGER durable_business_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_business_write()',target);
 END LOOP;
END $$;
COMMIT;
