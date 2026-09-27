import { describe, expect, it, vi } from "vitest";
import { applyMigrations, MIGRATIONS } from "../../../scripts/migrations.mjs";

describe("versioned migration runner", () => {
  it("contains every incremental migration required by legacy databases", () => {
    expect(MIGRATIONS).toEqual(expect.arrayContaining([
      "migrate-estimate-rejection.sql",
      "migrate-sales-signature.sql",
      "migrate-account-activation.sql",
      "migrate-catalog.sql",
    ]));
  });

  it("runs pending files once and records their checksum", async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT name") ? [] : [] }));
    const load = vi.fn(async (name: string) => `-- ${name}`);
    await expect(applyMigrations({ query }, load)).resolves.toEqual([...MIGRATIONS]);
    expect(load).toHaveBeenCalledTimes(MIGRATIONS.length);
    expect(query.mock.calls.filter(([sql]) => String(sql).startsWith("INSERT INTO schema_migrations"))).toHaveLength(MIGRATIONS.length);
  });

  it("rejects a migration changed after it was applied", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.startsWith("SELECT name") ? [{ name: MIGRATIONS[0], checksum: "different" }] : [],
    }));
    await expect(applyMigrations({ query }, async (name) => `-- ${name}`)).rejects.toThrow("ha cambiado");
  });

  it("rolls back an aborted migration before unlocking and releasing the connection", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql === "-- schema.sql") throw new Error("migration failed");
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    await expect(applyMigrations(pool, async (name) => `-- ${name}`)).rejects.toThrow("migration failed");
    expect(calls).toContain("ROLLBACK");
    expect(calls.indexOf("ROLLBACK")).toBeLessThan(calls.indexOf("SELECT pg_advisory_unlock(48127, 9026)"));
    expect(client.release).toHaveBeenCalledOnce();
  });
});
