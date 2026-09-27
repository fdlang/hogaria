import pg from "pg";
import { applyMigrations } from "./migrations.mjs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no esta configurada en apps/api/.env");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const completed = await applyMigrations(pool);
  console.log(`[db] ${completed.length} migrations applied`);
} finally {
  await pool.end();
}
