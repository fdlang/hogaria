import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("full database reset", () => {
  it("removes the migration ledger and every table introduced incrementally", async () => {
    const sql = await readFile(new URL("../../../database/reset-all.sql", import.meta.url), "utf8");
    for (const table of ["schema_migrations", "notification_event_outbox", "user_notifications", "catalog_price_history"])
      expect(sql).toMatch(new RegExp(`\\b${table}\\b`));
  });
});
