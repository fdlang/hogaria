import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

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
];

export const migrationChecksum = (sql) => createHash("sha256").update(sql).digest("hex");

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
      if (previous && previous !== digest) {
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
