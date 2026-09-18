import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");
const sql = await readFile(new URL("../database/migrate-sales-signature.sql", import.meta.url), "utf8");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(sql);
  console.log("[db] sales signature migration applied");
} finally {
  await pool.end();
}
