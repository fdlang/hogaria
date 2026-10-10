import pg from "pg";
import { CATALOG } from "../../web/src/features/catalog/catalog.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");

const BUSINESS_APPROVAL = {
  sourceName: "Tarifario Hogaria confirmado por administración",
  priceDate: "2026-10-10",
  validFrom: "2026-10-10",
  validUntil: "2027-01-10",
} as const;

const items = CATALOG.flatMap(category => category.items.map(item => {
  const approved = item.precio > 0 && item.active !== false;
  return ({
  reference: item.ref,
  category: category.categoria,
  description: item.descripcion,
  unit: item.unidad,
  salePrice: item.precio,
  vatRate: item.iva,
  active: approved,
  reviewStatus: item.reviewStatus ?? (approved ? "verified" : "pending_review"),
  itemType: item.itemType ?? "simple",
  laborCost: item.laborCost ?? null,
  materialCost: item.materialCost ?? null,
  auxiliaryCost: item.auxiliaryCost ?? null,
  sourceName: item.sourceName ?? (approved ? BUSINESS_APPROVAL.sourceName : null),
  sourceUrl: item.sourceUrl ?? null,
  priceDate: item.priceDate ?? (approved ? BUSINESS_APPROVAL.priceDate : null),
  validFrom: item.validFrom ?? (approved ? BUSINESS_APPROVAL.validFrom : null),
  validUntil: item.validUntil ?? (approved ? BUSINESS_APPROVAL.validUntil : null),
  searchTerms: item.searchTerms ?? [],
  });
}));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query("BEGIN");
  for (const item of items) {
    await pool.query(
      `INSERT INTO catalog_items(
         reference, category, description, unit, sale_price, vat_rate, active, item_type,
         labor_cost, material_cost, auxiliary_cost, source_name, source_url, price_date, search_terms,
         review_status, valid_from, valid_until
       ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (reference) DO NOTHING`,
      [item.reference, item.category, item.description, item.unit, item.salePrice, item.vatRate,
        item.active, item.itemType, item.laborCost, item.materialCost, item.auxiliaryCost,
        item.sourceName, item.sourceUrl, item.priceDate, item.searchTerms, item.reviewStatus,
        item.validFrom, item.validUntil],
    );
  }
  await pool.query("COMMIT");
  console.log(`[db] ${items.length} catalog items checked; existing items were preserved`);
} catch (error) {
  await pool.query("ROLLBACK");
  throw error;
} finally {
  await pool.end();
}
