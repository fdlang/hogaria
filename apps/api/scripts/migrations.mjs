import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const LEGACY_EOL_CHECKSUMS = Object.freeze({
  "notification-outbox.sql": ["d125ca904b462c883d2c57498ee4840190767d9be10360d86716a95d83e954bb"],
});

export const MIGRATIONS = [
  "schema.sql",
  "migrate-account-activation.sql",
  "migrate-estimate-rejection.sql",
  "migrate-sales-signature.sql",
  "migrate-catalog.sql",
  "migrate-rate-limits.sql",
  "professional-users.sql",
  "work-tracking.sql",
  "client-notifications.sql",
  "notification-outbox.sql",
  "commercial-workflow.sql",
  "durable-audit.sql",
  "app-notifications.sql",
  "catalog-pricing.sql",
  "catalog-governance.sql",
  "catalog-approved-prices.sql",
  "work-tracking-hardening.sql",
  "catalog-cost-composition.sql",
];

const sha256 = (sql) => createHash("sha256").update(sql).digest("hex");
export const normalizeMigrationSql = (sql) => sql.replace(/\r\n?/g, "\n");
export const migrationChecksum = (sql) => sha256(normalizeMigrationSql(sql));
export function migrationChecksumCandidates(name, sql) {
  const normalized = normalizeMigrationSql(sql);
  return new Set([
    migrationChecksum(normalized),
    sha256(sql),
    sha256(normalized.replace(/\n/g, "\r\n")),
    ...(LEGACY_EOL_CHECKSUMS[name] ?? []),
  ]);
}

export async function applyMigrations(pool, load = (name) =>
  readFile(new URL(`../database/${name}`, import.meta.url), "utf8")) {
  const client = typeof pool.connect === "function" ? await pool.connect() : pool;
  try {
    await client.query("SELECT pg_advisory_lock(48127, 9026)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = new Map((await client.query(
      "SELECT name,checksum FROM schema_migrations",
    )).rows.map((row) => [row.name, row.checksum]));
    const completed = [];
    for (const name of MIGRATIONS) {
      const sql = await load(name);
      const digest = migrationChecksum(sql);
      const previous = applied.get(name);
      if (previous && !migrationChecksumCandidates(name, sql).has(previous)) {
        throw new Error(`La migracion aplicada ${name} ha cambiado; crea una migracion incremental nueva`);
      }
      if (previous) continue;
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [name, digest],
      );
      completed.push(name);
    }
    return completed;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.query("SELECT pg_advisory_unlock(48127, 9026)").catch(() => undefined);
    client.release?.();
  }
}
