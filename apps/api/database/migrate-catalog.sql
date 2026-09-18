BEGIN;

CREATE TABLE IF NOT EXISTS catalog_items (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  sale_price NUMERIC(12, 2) NOT NULL CHECK (sale_price >= 0),
  vat_rate SMALLINT NOT NULL DEFAULT 21 CHECK (vat_rate BETWEEN 0 AND 100),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_items_category_active_idx
  ON catalog_items (category, active, reference);

COMMIT;
