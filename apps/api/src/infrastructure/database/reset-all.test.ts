import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertLocalDatabaseTarget } from "../../../scripts/database-safety.mjs";

describe("full database reset", () => {
  it("removes the migration ledger and every table introduced incrementally", async () => {
    const sql = await readFile(new URL("../../../database/reset-all.sql", import.meta.url), "utf8");
    for (const table of ["schema_migrations", "notification_event_outbox", "user_notifications", "catalog_price_history", "account_access_outbox"])
      expect(sql).toMatch(new RegExp(`\\b${table}\\b`));
  });

  it.each([
    "postgresql://dev:secret@localhost:5432/hogaria",
    "postgres://dev:secret@127.0.0.1:5432/hogaria",
    "postgresql://dev:secret@[::1]:5432/hogaria",
  ])("allows an explicitly local database target: %s", (databaseUrl) => {
    expect(() => assertLocalDatabaseTarget(databaseUrl, {})).not.toThrow();
  });

  it.each([
    "postgresql://user:secret@database.example.com/hogaria",
    "postgresql://user:secret@10.0.0.8/hogaria",
    "mysql://user:secret@localhost/hogaria",
    "not-a-url",
  ])("rejects a non-local or invalid database target without exposing credentials", (databaseUrl) => {
    expect(() => assertLocalDatabaseTarget(databaseUrl, {})).toThrow("Reset bloqueado");
    try {
      assertLocalDatabaseTarget(databaseUrl, {});
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });

  it("rejects local targets when the process is running in production or Vercel", () => {
    const databaseUrl = "postgresql://dev:secret@localhost:5432/hogaria";
    expect(() => assertLocalDatabaseTarget(databaseUrl, { NODE_ENV: "production" })).toThrow("produccion");
    expect(() => assertLocalDatabaseTarget(databaseUrl, { VERCEL: "1" })).toThrow("Vercel");
  });
});
