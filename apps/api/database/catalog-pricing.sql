BEGIN;

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'simple';
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(12,2);
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS material_cost NUMERIC(12,2);
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS auxiliary_cost NUMERIC(12,2);
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS overhead_percent NUMERIC(5,2);
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS target_margin_percent NUMERIC(5,2);
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS price_date DATE;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS search_terms TEXT[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_type_check CHECK (item_type IN ('simple','composite'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_costs_check CHECK (
    (labor_cost IS NULL OR labor_cost >= 0) AND
    (material_cost IS NULL OR material_cost >= 0) AND
    (auxiliary_cost IS NULL OR auxiliary_cost >= 0)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_rates_check CHECK (
    (overhead_percent IS NULL OR overhead_percent BETWEEN 0 AND 100) AND
    (target_margin_percent IS NULL OR target_margin_percent >= 0 AND target_margin_percent < 100)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_validity_check CHECK (
    valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_cost_evidence_check CHECK (
    (labor_cost IS NULL AND material_cost IS NULL AND auxiliary_cost IS NULL)
    OR (NULLIF(BTRIM(source_name), '') IS NOT NULL AND price_date IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS catalog_price_history (
  id BIGSERIAL PRIMARY KEY,
  catalog_item_id BIGINT NOT NULL REFERENCES catalog_items(id),
  snapshot JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS catalog_price_history_item_idx
  ON catalog_price_history(catalog_item_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION record_catalog_price_history() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO catalog_price_history(catalog_item_id, snapshot)
    VALUES (NEW.id, jsonb_build_object(
      'salePrice', NEW.sale_price,
      'laborCost', NEW.labor_cost,
      'materialCost', NEW.material_cost,
      'auxiliaryCost', NEW.auxiliary_cost,
      'overheadPercent', NEW.overhead_percent,
      'targetMarginPercent', NEW.target_margin_percent,
      'sourceName', NEW.source_name,
      'sourceUrl', NEW.source_url,
      'priceDate', NEW.price_date,
      'validFrom', NEW.valid_from,
      'validUntil', NEW.valid_until
    ));
  ELSIF ROW(
    OLD.sale_price, OLD.labor_cost, OLD.material_cost, OLD.auxiliary_cost,
    OLD.overhead_percent, OLD.target_margin_percent, OLD.source_name,
    OLD.source_url, OLD.price_date, OLD.valid_from, OLD.valid_until
  ) IS DISTINCT FROM ROW(
    NEW.sale_price, NEW.labor_cost, NEW.material_cost, NEW.auxiliary_cost,
    NEW.overhead_percent, NEW.target_margin_percent, NEW.source_name,
    NEW.source_url, NEW.price_date, NEW.valid_from, NEW.valid_until
  ) THEN
    INSERT INTO catalog_price_history(catalog_item_id, snapshot)
    VALUES (NEW.id, jsonb_build_object(
      'salePrice', NEW.sale_price,
      'laborCost', NEW.labor_cost,
      'materialCost', NEW.material_cost,
      'auxiliaryCost', NEW.auxiliary_cost,
      'overheadPercent', NEW.overhead_percent,
      'targetMarginPercent', NEW.target_margin_percent,
      'sourceName', NEW.source_name,
      'sourceUrl', NEW.source_url,
      'priceDate', NEW.price_date,
      'validFrom', NEW.valid_from,
      'validUntil', NEW.valid_until
    ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_price_history_trigger ON catalog_items;
CREATE TRIGGER catalog_price_history_trigger
AFTER INSERT OR UPDATE ON catalog_items
FOR EACH ROW EXECUTE FUNCTION record_catalog_price_history();

COMMIT;
