// Administrative recovery CLI. It never prints payloads, addresses or tokens.
// For email queues, verify in the provider that the message was not delivered
// before explicitly reactivating it.
import pg from "pg";

const [command = "list", queue, id, confirmation] = process.argv.slice(2);
const queues = {
  client: { table: "client_email_notifications", state: "state", attempts: "attempts", first: "first_attempt_at", next: "next_attempt_at", reason: "failure_reason", updated: "updated_at" },
  event: { table: "notification_event_outbox", state: "state", attempts: "attempts", first: null, next: "next_attempt_at", reason: "failure_reason", updated: null },
  "user-email": { table: "user_notifications", state: "email_state", attempts: "email_attempts", first: "email_first_attempt_at", next: "email_next_attempt_at", reason: "email_failure_reason", updated: null },
  "account-access": { table: "account_access_outbox", state: "state", attempts: "attempts", first: "first_attempt_at", next: "next_attempt_at", reason: "failure_reason", updated: "updated_at" },
};

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no configurada");
if (!["list", "retry"].includes(command)) throw new Error("Usa list o retry <cola> <uuid> --confirmed-not-delivered");
if (command === "retry" && (!(queue in queues) || !/^[0-9a-f-]{36}$/i.test(id ?? "") || confirmation !== "--confirmed-not-delivered")) {
  throw new Error("Colas: client, event, user-email, account-access. Comprueba primero la entrega y confirma con --confirmed-not-delivered");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (command === "list") {
    for (const [name, config] of Object.entries(queues)) {
      const rows = (await pool.query(`SELECT ${config.state} AS state,count(*)::int AS count,min(created_at) AS oldest FROM ${config.table} GROUP BY ${config.state} ORDER BY ${config.state}`)).rows;
      console.log(`[${name}]`);
      console.table(rows);
    }
  } else {
    const config = queues[queue];
    const assignments = [`${config.state}='pending'`, `${config.attempts}=0`, `${config.next}=now()`, `${config.reason}=NULL`, ...(config.first ? [`${config.first}=NULL`] : []), ...(config.updated ? [`${config.updated}=now()`] : [])].join(",");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(`UPDATE ${config.table} SET ${assignments} WHERE id=$1 AND ${config.state}='failed' RETURNING id`, [id]);
      if (result.rowCount !== 1) throw new Error("Solo se pueden reactivar elementos fallidos de la cola indicada");
      const auditId = crypto.randomUUID();
      await client.query("INSERT INTO audit_entries(id,payload,timestamp) VALUES($1,$2,now())", [auditId, JSON.stringify({
        action: "NOTIFICATION_MANUAL_RETRY", id: auditId, userId: 0, userName: "Operador de base de datos", timestamp: new Date().toISOString(),
        ip: "not-applicable", userAgent: "notification-deadletters-cli", details: { queue, notificationId: id, confirmation: "provider_checked_not_delivered" },
      })]);
      await client.query("COMMIT");
      console.log(`Elemento reactivado en ${queue}. Lo recogerá el siguiente procesamiento de cola.`);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
} finally { await pool.end(); }
