import { readFile } from "node:fs/promises";
import pg from "pg";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no configurada");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{await pool.query(await readFile(new URL("../database/client-notifications.sql",import.meta.url),"utf8"));await pool.query(await readFile(new URL("../database/notification-outbox.sql",import.meta.url),"utf8"));console.log("Client notifications schema and transactional outbox applied");}
finally{await pool.end();}
