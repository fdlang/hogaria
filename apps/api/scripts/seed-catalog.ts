import pg from "pg";
import { CATALOG } from "../../web/src/features/catalog/catalog.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");

const items = CATALOG.flatMap(category => category.items.map(item => ({
  reference: item.ref,
  category: category.categoria,
  description: item.descripcion,
  unit: item.unidad,
  salePrice: item.precio,
  vatRate: item.iva,
})));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query("BEGIN");
  for (const item of items) {
    await pool.query(
      `INSERT INTO catalog_items(reference, category, description, unit, sale_price, vat_rate)
       VALUES($1, $2, $3, $4, $5, $6)
       ON CONFLICT (reference) DO NOTHING`,
      [item.reference, item.category, item.description, item.unit, item.salePrice, item.vatRate],
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
