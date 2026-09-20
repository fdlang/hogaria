import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada en apps/api/.env");
const sql = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(sql);
  for (const file of ["migrate-rate-limits.sql", "professional-users.sql", "work-tracking.sql", "client-notifications.sql", "notification-outbox.sql", "commercial-workflow.sql", "durable-audit.sql"])
    await pool.query(await readFile(new URL(`../database/${file}`, import.meta.url), "utf8"));
  console.log("[db] schema applied");
}
finally { await pool.end(); }
