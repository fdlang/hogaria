BEGIN;

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending_review';
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS replacement_reference TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS review_note TEXT;

UPDATE catalog_items
SET review_status = CASE WHEN active THEN 'pending_review' ELSE 'archived' END,
    active = FALSE
WHERE review_status NOT IN ('verified', 'archived') OR active = TRUE;

ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_review_status_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_review_status_check
  CHECK (review_status IN ('pending_review', 'verified', 'archived'));
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_review_active_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_review_active_check
  CHECK ((review_status = 'verified' AND active) OR (review_status <> 'verified' AND NOT active));
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_review_note_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_review_note_check
  CHECK (review_note IS NULL OR char_length(review_note) <= 500);

INSERT INTO catalog_price_history(catalog_item_id, snapshot)
SELECT item.id, jsonb_build_object(
  'operation', 'legacy_baseline', 'reference', item.reference,
  'category', item.category, 'description', item.description, 'unit', item.unit,
  'salePrice', item.sale_price, 'vatRate', item.vat_rate, 'active', item.active,
  'reviewStatus', item.review_status, 'replacementReference', item.replacement_reference,
  'reviewNote', item.review_note, 'itemType', item.item_type,
  'laborCost', item.labor_cost, 'materialCost', item.material_cost,
  'auxiliaryCost', item.auxiliary_cost, 'overheadPercent', item.overhead_percent,
  'targetMarginPercent', item.target_margin_percent, 'sourceName', item.source_name,
  'sourceUrl', item.source_url, 'priceDate', item.price_date,
  'validFrom', item.valid_from, 'validUntil', item.valid_until,
  'searchTerms', item.search_terms
)
FROM catalog_items item
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_price_history history
  WHERE history.catalog_item_id = item.id AND history.snapshot->>'operation' = 'legacy_baseline'
);

CREATE OR REPLACE FUNCTION record_catalog_price_history() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO catalog_price_history(catalog_item_id, snapshot)
  VALUES(NEW.id, jsonb_build_object(
    'operation', lower(TG_OP), 'reference', NEW.reference,
    'category', NEW.category, 'description', NEW.description, 'unit', NEW.unit,
    'salePrice', NEW.sale_price, 'vatRate', NEW.vat_rate, 'active', NEW.active,
    'reviewStatus', NEW.review_status, 'replacementReference', NEW.replacement_reference,
    'reviewNote', NEW.review_note, 'itemType', NEW.item_type,
    'laborCost', NEW.labor_cost, 'materialCost', NEW.material_cost,
    'auxiliaryCost', NEW.auxiliary_cost, 'overheadPercent', NEW.overhead_percent,
    'targetMarginPercent', NEW.target_margin_percent, 'sourceName', NEW.source_name,
    'sourceUrl', NEW.source_url, 'priceDate', NEW.price_date,
    'validFrom', NEW.valid_from, 'validUntil', NEW.valid_until,
    'searchTerms', NEW.search_terms
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reject_catalog_history_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'catalog_price_history is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_price_history_immutable_rows ON catalog_price_history;
CREATE TRIGGER catalog_price_history_immutable_rows
BEFORE UPDATE OR DELETE ON catalog_price_history
FOR EACH ROW EXECUTE FUNCTION reject_catalog_history_mutation();

DROP TRIGGER IF EXISTS catalog_price_history_immutable_truncate ON catalog_price_history;
CREATE TRIGGER catalog_price_history_immutable_truncate
BEFORE TRUNCATE ON catalog_price_history
FOR EACH STATEMENT EXECUTE FUNCTION reject_catalog_history_mutation();

COMMIT;
