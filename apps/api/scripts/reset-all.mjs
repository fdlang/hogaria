import { readFile } from "node:fs/promises";
import pg from "pg";

if (process.env.CONFIRM_DATABASE_RESET !== "RESET_HOGARIA" && !process.argv.includes("--confirm=RESET_HOGARIA")) {
  throw new Error("Reset cancelado: confirma explícitamente con --confirm=RESET_HOGARIA");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");

const sql = await readFile(new URL("../database/reset-all.sql", import.meta.url), "utf8");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(sql);
  console.log("[db] full application reset applied");
} finally {
  await pool.end();
}
