import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { applyMigrations, MIGRATIONS } from "../../../scripts/migrations.mjs";

let database: PGlite | undefined;

afterEach(async () => {
  await database?.close();
  database = undefined;
});

describe("catalog pricing migration", () => {
  it("applies idempotently and records only traceable price history", async () => {
    database = new PGlite();
    const adapter = {
      connect: async () => adapter,
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("pg_advisory_")) return { rows: [] };
        if (!params && sql.split(";").length > 2) {
          await database!.exec(sql);
          return { rows: [] };
        }
        return database!.query(sql, params);
      },
      release: () => undefined,
    };

    expect(await applyMigrations(adapter)).toHaveLength(MIGRATIONS.length);
    expect(await applyMigrations(adapter)).toEqual([]);

    const columns = await database.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'catalog_items'
        AND column_name IN ('labor_cost', 'source_name', 'search_terms', 'review_status', 'replacement_reference', 'labor_breakdown', 'tariff_zone', 'price_version')
      ORDER BY column_name
    `);
    expect(columns.rows.map(row => row.column_name)).toEqual(["labor_breakdown", "labor_cost", "price_version", "replacement_reference", "review_status", "search_terms", "source_name", "tariff_zone"]);

    await database.query(`
      INSERT INTO catalog_items(
        reference, category, description, unit, sale_price, vat_rate, active,
        labor_cost, source_name, price_date
      ) VALUES('TST-LOCAL', 'Prueba', 'Validación local', 'ud', 100, 21, false, 25, 'Fuente local', '2026-10-10')
    `);
    await database.query("UPDATE catalog_items SET sale_price=120 WHERE reference='TST-LOCAL'");

    const history = await database.query<{ count: number }>(`
      SELECT COUNT(*)::int AS count
      FROM catalog_price_history history
      JOIN catalog_items item ON item.id=history.catalog_item_id
      WHERE item.reference='TST-LOCAL'
    `);
    expect(history.rows[0]?.count).toBe(2);
    const latest = await database.query<{ snapshot: Record<string, unknown> }>(`
      SELECT snapshot FROM catalog_price_history history
      JOIN catalog_items item ON item.id=history.catalog_item_id
      WHERE item.reference='TST-LOCAL' ORDER BY history.id DESC LIMIT 1
    `);
    expect(latest.rows[0]?.snapshot).toMatchObject({ reference: "TST-LOCAL", description: "Validación local", reviewStatus: "pending_review", salePrice: 120 });
    expect(latest.rows[0]?.snapshot).toMatchObject({ tariffZone: "Madrid", priceVersion: 2, pricingMode: "legacy_total" });
    await expect(database.query("DELETE FROM catalog_price_history")).rejects.toThrow("append-only");

    await expect(database.query(`
      INSERT INTO catalog_items(
        reference, category, description, unit, sale_price, vat_rate, active, labor_cost
      ) VALUES('TST-BAD', 'Prueba', 'Sin fuente', 'ud', 0, 21, false, 10)
    `)).rejects.toThrow();
    await expect(database.query(`
      INSERT INTO catalog_items(reference, category, description, unit, sale_price, vat_rate, active)
      VALUES('TST-UNIT', 'Prueba', 'Unidad inválida', 'mes', 10, 21, false)
    `)).rejects.toThrow();

    await database.query(`
      INSERT INTO catalog_items(reference, category, description, unit, sale_price, vat_rate, active)
      VALUES
        ('PRE-001', 'Previos', 'Precio aprobado', 'global', 380, 21, false),
        ('DEM-008', 'Demoliciones', 'Candidato sin precio', 'ml', 0, 21, false),
        ('CUSTOM-001', 'Prueba', 'Partida ajena', 'ud', 100, 21, false)
    `);
    const approvalMigration = await readFile(
      new URL("../../../database/catalog-approved-prices.sql", import.meta.url),
      "utf8",
    );
    await database.exec(approvalMigration);
    await database.exec(approvalMigration);

    const approval = await database.query<{
      reference: string;
      active: boolean;
      review_status: string;
      source_name: string | null;
    }>(`
      SELECT reference, active, review_status, source_name
      FROM catalog_items
      WHERE reference IN ('PRE-001', 'DEM-008', 'CUSTOM-001')
      ORDER BY reference
    `);
    expect(approval.rows).toEqual([
      { reference: "CUSTOM-001", active: false, review_status: "pending_review", source_name: null },
      { reference: "DEM-008", active: false, review_status: "pending_review", source_name: null },
      { reference: "PRE-001", active: true, review_status: "verified", source_name: "Tarifario Hogaria confirmado por administración" },
    ]);
  });
});
