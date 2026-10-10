import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
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
        AND column_name IN ('labor_cost', 'source_name', 'search_terms')
      ORDER BY column_name
    `);
    expect(columns.rows.map(row => row.column_name)).toEqual(["labor_cost", "search_terms", "source_name"]);

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

    await expect(database.query(`
      INSERT INTO catalog_items(
        reference, category, description, unit, sale_price, vat_rate, active, labor_cost
      ) VALUES('TST-BAD', 'Prueba', 'Sin fuente', 'ud', 0, 21, false, 10)
    `)).rejects.toThrow();
  });
});
