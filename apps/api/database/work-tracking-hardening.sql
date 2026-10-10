BEGIN;
DROP TRIGGER IF EXISTS immutable_work_rates_truncate ON work_rates;
CREATE TRIGGER immutable_work_rates_truncate
BEFORE TRUNCATE ON work_rates
FOR EACH STATEMENT EXECUTE FUNCTION protect_work_history();

DROP TRIGGER IF EXISTS immutable_work_events_truncate ON work_events;
CREATE TRIGGER immutable_work_events_truncate
BEFORE TRUNCATE ON work_events
FOR EACH STATEMENT EXECUTE FUNCTION protect_work_history();
COMMIT;
