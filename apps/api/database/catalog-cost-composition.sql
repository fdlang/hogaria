BEGIN;

UPDATE catalog_items SET unit='global' WHERE unit='mes';

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'legacy_total';
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS labor_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS material_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS auxiliary_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS tariff_zone TEXT NOT NULL DEFAULT 'Madrid';
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS price_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_unit_check;
-- Los valores históricos ajenos a la lista no se reinterpretan sin evidencia.
-- La restricción se aplica a toda alta o modificación nueva y podrá validarse
-- cuando administración haya revisado esas excepciones.
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_unit_check CHECK (unit IN ('m²','ml','ud','h','global')) NOT VALID;
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_pricing_mode_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_pricing_mode_check CHECK (pricing_mode IN ('legacy_total','decomposed'));
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_breakdown_arrays_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_breakdown_arrays_check CHECK (
  jsonb_typeof(labor_breakdown)='array' AND jsonb_typeof(material_breakdown)='array' AND jsonb_typeof(auxiliary_breakdown)='array'
);
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_tariff_zone_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_tariff_zone_check CHECK (NULLIF(BTRIM(tariff_zone),'') IS NOT NULL);
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_price_version_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_price_version_check CHECK (price_version > 0);

CREATE OR REPLACE FUNCTION increment_catalog_price_version() RETURNS TRIGGER AS $$
BEGIN
  IF ROW(OLD.unit,OLD.sale_price,OLD.labor_cost,OLD.material_cost,OLD.auxiliary_cost,
    OLD.overhead_percent,OLD.target_margin_percent,OLD.source_name,OLD.source_url,
    OLD.price_date,OLD.valid_from,OLD.valid_until,OLD.pricing_mode,OLD.labor_breakdown,
    OLD.material_breakdown,OLD.auxiliary_breakdown,OLD.tariff_zone)
  IS DISTINCT FROM ROW(NEW.unit,NEW.sale_price,NEW.labor_cost,NEW.material_cost,NEW.auxiliary_cost,
    NEW.overhead_percent,NEW.target_margin_percent,NEW.source_name,NEW.source_url,
    NEW.price_date,NEW.valid_from,NEW.valid_until,NEW.pricing_mode,NEW.labor_breakdown,
    NEW.material_breakdown,NEW.auxiliary_breakdown,NEW.tariff_zone) THEN
    NEW.price_version := OLD.price_version + 1;
  ELSE
    NEW.price_version := OLD.price_version;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_price_version_trigger ON catalog_items;
CREATE TRIGGER catalog_price_version_trigger BEFORE UPDATE ON catalog_items
FOR EACH ROW EXECUTE FUNCTION increment_catalog_price_version();

CREATE OR REPLACE FUNCTION record_catalog_price_history() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO catalog_price_history(catalog_item_id, snapshot)
  VALUES(NEW.id, jsonb_build_object(
    'operation', lower(TG_OP), 'reference', NEW.reference, 'category', NEW.category,
    'description', NEW.description, 'unit', NEW.unit, 'salePrice', NEW.sale_price,
    'vatRate', NEW.vat_rate, 'active', NEW.active, 'reviewStatus', NEW.review_status,
    'replacementReference', NEW.replacement_reference, 'reviewNote', NEW.review_note,
    'itemType', NEW.item_type, 'laborCost', NEW.labor_cost, 'materialCost', NEW.material_cost,
    'auxiliaryCost', NEW.auxiliary_cost, 'overheadPercent', NEW.overhead_percent,
    'targetMarginPercent', NEW.target_margin_percent, 'sourceName', NEW.source_name,
    'sourceUrl', NEW.source_url, 'priceDate', NEW.price_date, 'validFrom', NEW.valid_from,
    'validUntil', NEW.valid_until, 'searchTerms', NEW.search_terms,
    'pricingMode', NEW.pricing_mode, 'laborBreakdown', NEW.labor_breakdown,
    'materialBreakdown', NEW.material_breakdown, 'auxiliaryBreakdown', NEW.auxiliary_breakdown,
    'tariffZone', NEW.tariff_zone, 'priceVersion', NEW.price_version
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
