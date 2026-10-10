import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { applyMigrations, MIGRATIONS, migrationChecksum, migrationChecksumCandidates } from "../../../scripts/migrations.mjs";

describe("versioned migration runner", () => {
  it("contains every incremental migration required by legacy databases", () => {
    expect(MIGRATIONS).toEqual(expect.arrayContaining([
      "migrate-estimate-rejection.sql",
      "migrate-sales-signature.sql",
      "migrate-account-activation.sql",
      "migrate-catalog.sql",
      "app-notifications.sql",
    ]));
  });

  it("runs pending files once and records their checksum", async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT name") ? [] : [] }));
    const load = vi.fn(async (name: string) => `-- ${name}`);
    await expect(applyMigrations({ query }, load)).resolves.toEqual([...MIGRATIONS]);
    expect(load).toHaveBeenCalledTimes(MIGRATIONS.length);
    expect(query.mock.calls.filter(([sql]) => String(sql).startsWith("INSERT INTO schema_migrations"))).toHaveLength(MIGRATIONS.length);
  });

  it("uses one canonical checksum across Windows and Linux line endings", () => {
    const linux = "BEGIN;\nSELECT 1;\nCOMMIT;\n";
    const windows = linux.replace(/\n/g, "\r\n");
    expect(migrationChecksum(windows)).toBe(migrationChecksum(linux));
    expect(migrationChecksumCandidates("schema.sql", linux)).toContain(
      "0407a28b67adea514ef4b6ee7b53aabb165a728523bea61aa8cd929cf3ec97df",
    );
  });

  it("accepts the known mixed-line legacy checksum without accepting other content", () => {
    const current = "irrelevant for the pinned legacy digest\n";
    expect(migrationChecksumCandidates("notification-outbox.sql", current)).toContain(
      "d125ca904b462c883d2c57498ee4840190767d9be10360d86716a95d83e954bb",
    );
    expect(migrationChecksumCandidates("schema.sql", current)).not.toContain(
      "d125ca904b462c883d2c57498ee4840190767d9be10360d86716a95d83e954bb",
    );
  });

  it("recognizes the Windows checksums already recorded for unchanged production SQL", async () => {
    const recorded = {
      "schema.sql": "1d03d0d694f6ec657312207b73ae73dfdbd815c4f242db7570a48d27388a1508",
      "professional-users.sql": "c65ed2c0beef559f14023398df7b7048afe9af62c0c73d8b2cc1008c138b4b6e",
      "notification-outbox.sql": "d125ca904b462c883d2c57498ee4840190767d9be10360d86716a95d83e954bb",
      "commercial-workflow.sql": "b83ed99d4682bc8a06b56d5359d5496622b978d5f0a219f41711976455db3409",
      "durable-audit.sql": "d00d3e9559375bc65aa2ca88c250cc64c3892120a3dde55d0e642174f65d0524",
    };
    for (const [name, checksum] of Object.entries(recorded)) {
      const sql = await readFile(new URL(`../../../database/${name}`, import.meta.url), "utf8");
      expect(migrationChecksumCandidates(name, sql.replace(/\r\n?/g, "\n"))).toContain(checksum);
    }
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
