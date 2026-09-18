BEGIN;

ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_estado_check;
ALTER TABLE estimates
  ADD CONSTRAINT estimates_estado_check
  CHECK (estado IN ('borrador','en_revision','enviado','firmado','aceptado','rechazado','caducado','sustituido'));

COMMIT;
